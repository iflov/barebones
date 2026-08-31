import { Inject, Injectable, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

import {
  createRepositoryToken,
  type PortOf,
  provideRepositoryPort,
} from '../src/common/persistence/provide-repository-port.js';
import {
  RepositoryContractError,
  UniqueConstraintError,
} from '../src/common/persistence/repository.port.js';
import { validationSchema } from '../src/config/env.validation.js';

/**
 * 영속화 포트 e2e (constitution A-1-P / D-1).
 *
 * 단위 테스트는 어댑터의 **번역과 계약 차단**을 단언한다. 그건 어댑터 안에서 결정되므로
 * Repository를 mock해도 의미가 있다.
 *
 * 여기서는 **mock으로는 확인할 수 없는 것**을 실제 DI + 실제 DB로 확인한다:
 * insert가 덮어쓰지 않는지, 빈 patch가 정말 아무 일도 안 하는지, `select: false` 컬럼이
 * 실제로 감춰지는지, `IS NULL` / `IN` 번역이 실제 SQL에서 의도대로 동작하는지.
 * mock은 무엇이든 돌려주므로, 이 항목들을 단위 테스트에 두면 통과하지만 아무것도 증명하지 못한다.
 *
 * 아래 엔티티·모듈은 **테스트 픽스처**다. `src/`에 도메인을 만들지 않는다 —
 * 이 저장소는 barebones-only다.
 */
@Entity({ name: 'persistence_probe_rows' })
class ProbeRow {
  @PrimaryGeneratedColumn('increment')
  id!: number;

  @Column({ length: 255, type: 'varchar', unique: true })
  name!: string;

  @Column({ nullable: true, type: 'text' })
  tag!: string | null;

  /** 도메인 Repository만 알아야 하는 지식의 대역 — 명시적으로 요청해야 조회된다. */
  @Column({ select: false, type: 'text' })
  secret!: string;
}

const PROBE_REPOSITORY = createRepositoryToken('PROBE_REPOSITORY', ProbeRow);

type TestDatabase = 'mariadb' | 'mysql' | 'postgres';

function testDatabase(): TestDatabase {
  switch (process.env.DB_TYPE) {
    case 'mariadb':
    case 'mysql':
    case 'postgres':
      return process.env.DB_TYPE;
    default:
      throw new Error(`Unsupported test database: ${process.env.DB_TYPE ?? 'unset'}`);
  }
}

/**
 * 도메인 Repository의 형태.
 *
 * 포트 타입(`FindCriteria`)이 공개 시그니처에 없다 — 도메인 값을 받고 도메인 결과를 돌려준다
 * (constitution A-1-W 방향 2). 정규화와 `select` 처리가 이 클래스 안에서 끝난다.
 * 주입 타입은 토큰에서 파생시킨다(`PortOf`) — 손으로 다시 쓰면 엔티티가 바뀔 때 어긋난다.
 */
@Injectable()
class ProbeRepository {
  constructor(
    @Inject(PROBE_REPOSITORY.token) private readonly rows: PortOf<typeof PROBE_REPOSITORY>,
  ) {}

  add(name: string, secret: string, tag: string | null = null): Promise<ProbeRow> {
    return this.rows.insert({ name: normalize(name), secret, tag });
  }

  findByName(name: string): Promise<ProbeRow | null> {
    return this.rows.findOne({ where: { name: normalize(name) } });
  }

  findByNameWithSecret(name: string): Promise<ProbeRow | null> {
    return this.rows.findOne({
      select: ['id', 'name', 'secret'],
      where: { name: normalize(name) },
    });
  }

  findUntagged(): Promise<ProbeRow[]> {
    return this.rows.findMany({ orderBy: { name: 'asc' }, where: { tag: null } });
  }

  findByNames(names: string[]): Promise<ProbeRow[]> {
    return this.rows.findMany({ where: { name: names.map(normalize) } });
  }

  countAll(): Promise<number> {
    return this.rows.count();
  }

  async clear(): Promise<void> {
    const rows = await this.rows.findMany();

    for (const row of rows) {
      await this.rows.remove({ id: row.id });
    }
  }

  rename(id: number, name: string): Promise<number> {
    return this.rows.update({ id }, { name: normalize(name) });
  }

  touch(id: number, patch: Partial<ProbeRow>): Promise<number> {
    return this.rows.update({ id }, patch);
  }

  removeByName(name: string): Promise<number> {
    return this.rows.remove({ name: normalize(name) });
  }

  /** 실수로 조건이 사라진 호출을 재현하기 위한 경로 (프로덕션 코드에는 이런 메서드를 두지 않는다). */
  findByOptionalTag(tag: string | undefined): Promise<ProbeRow[]> {
    return this.rows.findMany({ where: { tag } });
  }
}

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

@Module({
  imports: [TypeOrmModule.forFeature([ProbeRow])],
  providers: [provideRepositoryPort(PROBE_REPOSITORY), ProbeRepository],
})
class ProbeModule {}

describe('persistence port wiring (e2e)', () => {
  let repository: ProbeRepository;
  let close: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const database = testDatabase();
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, validationSchema }),
        // docker-compose.test.yml의 선택된 실제 RDB에 픽스처 엔티티를 올린다.
        // 어댑터의 SQL 번역과 드라이버 에러 변환을 운영 기본 드라이버에서 검증한다.
        TypeOrmModule.forRoot({
          database: process.env.DB_DATABASE,
          entities: [ProbeRow],
          host: process.env.DB_HOST,
          logging: false,
          password: process.env.DB_PASSWORD,
          port: Number(process.env.DB_PORT),
          schema: database === 'postgres' ? process.env.DB_SCHEMA : undefined,
          synchronize: true,
          type: database,
          username: process.env.DB_USERNAME,
        }),
        ProbeModule,
      ],
    }).compile();

    const app = await moduleRef.init();
    close = () => app.close();
    repository = moduleRef.get(ProbeRepository);
  });

  afterAll(async () => {
    await close?.();
  });

  beforeEach(async () => {
    await repository.clear();
  });

  it('resolves the domain repository through the port', () => {
    expect(repository).toBeInstanceOf(ProbeRepository);
  });

  it('insert / findOne 왕복이 성립한다', async () => {
    const created = await repository.add('  Alpha  ', 'shhh');

    expect(created.id).toBeDefined();

    const found = await repository.findByName('ALPHA');

    expect(found?.name).toBe('alpha');
  });

  it('생성 컬럼(자동 증가 PK)이 반환된 엔티티에 채워진다', async () => {
    const created = await repository.add('Kappa', 'shhh');

    expect(typeof created.id).toBe('number');
    expect(created.id).toBeGreaterThan(0);
  });

  /**
   * `save()`를 쓰면 이 케이스가 조용히 통과하고 기존 행이 덮어써진다.
   * mock으로는 절대 잡을 수 없는 차이라 여기서만 검증된다.
   */
  it('insert는 덮어쓰지 않는다 — 중복 키는 UniqueConstraintError로 올라온다', async () => {
    await repository.add('Lambda', 'first');

    // 드라이버 에러코드가 아니라 포트 에러가 나와야 한다 — 도메인이 DB를 몰라도 되게 하는 지점.
    // 이 번역이 없으면 AllExceptionsFilter가 500으로 만들어, 클라이언트가
    // "내 요청이 잘못됐다(409)"와 "서버가 고장났다(500)"를 구분할 수 없다.
    await expect(repository.add('Lambda', 'second')).rejects.toThrow(UniqueConstraintError);

    const rows = await repository.findByNames(['Lambda']);

    expect(rows).toHaveLength(1);
    await expect(repository.findByNameWithSecret('lambda')).resolves.toMatchObject({
      secret: 'first',
    });
  });

  it('정규화를 거치지 않은 값으로는 못 찾는다 — 정규화가 Repository 안에 있다는 증거', async () => {
    await repository.add('Beta', 'shhh');

    const rows = await repository.findByNames(['beta']);

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('beta');
  });

  it('select:false 컬럼은 명시적으로 요청해야 온다', async () => {
    await repository.add('Gamma', 'top-secret');

    const withoutSecret = await repository.findByName('gamma');
    const withSecret = await repository.findByNameWithSecret('gamma');

    expect(withoutSecret?.secret).toBeUndefined();
    expect(withSecret?.secret).toBe('top-secret');
  });

  it('null where가 IS NULL로 번역된다 (그대로 넘기면 조건이 무시된다)', async () => {
    await repository.add('Delta', 'shhh', 'tagged');
    await repository.add('Epsilon', 'shhh');

    const untagged = await repository.findUntagged();

    expect(untagged.every((row) => row.tag === null)).toBe(true);
    expect(untagged.map((row) => row.name)).not.toContain('delta');
    expect(untagged.map((row) => row.name)).toContain('epsilon');
  });

  it('배열 where가 IN으로 번역된다', async () => {
    await repository.add('Zeta', 'shhh');
    await repository.add('Eta', 'shhh');

    const rows = await repository.findByNames(['Zeta', 'ETA']);

    expect(rows.map((row) => row.name).sort()).toEqual(['eta', 'zeta']);
  });

  it('빈 배열 where는 아무것도 매칭하지 않는다 (전체 조회로 새지 않는다)', async () => {
    await expect(repository.findByNames([])).resolves.toEqual([]);
  });

  /**
   * 조건이 사라져서 전체 행이 나가는 사고를 실제 DB에서 재현한다.
   * 차단이 없다면 이 호출은 예외 없이 **모든 행**을 돌려준다.
   */
  it('where 값이 undefined면 전체 조회로 바뀌는 대신 예외가 난다', async () => {
    await repository.add('Mu', 'shhh');

    await expect(repository.findByOptionalTag(undefined)).rejects.toThrow(RepositoryContractError);
  });

  it('update가 영향받은 행 수를 돌려준다', async () => {
    const created = await repository.add('Theta', 'shhh');

    await expect(repository.rename(created.id, 'Theta-Renamed')).resolves.toBe(1);
    await expect(repository.findByName('theta-renamed')).resolves.not.toBeNull();
  });

  /** 실제 TypeORM은 빈 patch에 UpdateValuesMissingError를 던진다. no-op 처리가 실제로 되는지 확인. */
  it('빈 patch는 예외 없이 0을 돌려주고 행을 바꾸지 않는다', async () => {
    const created = await repository.add('Nu', 'shhh');

    await expect(repository.touch(created.id, {})).resolves.toBe(0);
    await expect(repository.findByName('nu')).resolves.toMatchObject({ name: 'nu' });
  });

  it('remove가 영향받은 행 수를 돌려주고 실제로 지운다', async () => {
    await repository.add('Iota', 'shhh');

    await expect(repository.removeByName('IOTA')).resolves.toBe(1);
    await expect(repository.findByName('iota')).resolves.toBeNull();
  });

  it('count가 전체 행 수를 센다', async () => {
    await repository.add('Omicron', 'shhh');

    await expect(repository.countAll()).resolves.toBe(1);
  });
});
