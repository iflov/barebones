import { FindOperator, type ObjectLiteral, type Repository } from 'typeorm';
import type { Mock } from 'vitest';

import { RepositoryContractError, UniqueConstraintError } from './repository.port';
import { TypeOrmRepositoryAdapter } from './typeorm-repository.adapter';

interface TestRow extends ObjectLiteral {
  id: string;
  email: string;
  passwordHash: string;
  deletedAt: Date | null;
  createdAt: Date;
}

interface MockRepository {
  count: Mock;
  create: Mock;
  delete: Mock;
  find: Mock;
  findOne: Mock;
  insert: Mock;
  merge: Mock;
  save: Mock;
  update: Mock;
}

let repository: MockRepository;
let adapter: TypeOrmRepositoryAdapter<TestRow>;

/** where 절의 특정 키가 어떤 FindOperator로 번역됐는지 단언한다. */
function operatorTypeOf(where: Record<string, unknown>, key: string): string {
  const value = where[key];

  if (!(value instanceof FindOperator)) {
    throw new Error(`${key} is not a FindOperator`);
  }

  return value.type;
}

function whereOf(mock: Mock): Record<string, unknown> {
  const [options] = mock.mock.calls[0] as [{ where: Record<string, unknown> }];

  return options.where;
}

beforeEach(() => {
  repository = {
    count: vi.fn().mockResolvedValue(3),
    create: vi.fn((data: unknown) => data),
    delete: vi.fn().mockResolvedValue({ affected: 2 }),
    find: vi.fn().mockResolvedValue([]),
    findOne: vi.fn().mockResolvedValue(null),
    insert: vi.fn().mockResolvedValue({ generatedMaps: [] }),
    merge: vi.fn((target: object, source: object) => Object.assign(target, source)),
    save: vi.fn((entity: unknown) => Promise.resolve(entity)),
    update: vi.fn().mockResolvedValue({ affected: 1 }),
  };

  adapter = new TypeOrmRepositoryAdapter<TestRow>(repository as unknown as Repository<TestRow>);
});

/**
 * 이 파일이 검증하는 것은 **중립 조건 → TypeORM 옵션 번역**과 **계약 위반 차단**이다.
 * 둘 다 어댑터 안에서 결정되므로 Repository를 mock해도 의미가 있다.
 *
 * 반대로 "insert가 덮어쓰지 않는가", "빈 patch에서 무슨 일이 나는가"처럼
 * **실제 ORM/DB 동작에 의존하는 것은 여기서 검증할 수 없다** — mock이 무엇이든 돌려주기 때문이다.
 * 그쪽은 `test/persistence.e2e-spec.ts`가 실제 DB로 확인한다.
 */
describe('TypeOrmRepositoryAdapter', () => {
  describe('findOne', () => {
    it('스칼라 where는 그대로 넘어간다', async () => {
      await adapter.findOne({ where: { email: 'user@example.com' } });

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { email: 'user@example.com' },
      });
    });

    it('배열 where는 In 연산자로 번역된다', async () => {
      await adapter.findOne({ where: { id: ['a', 'b'] } });

      expect(operatorTypeOf(whereOf(repository.findOne), 'id')).toBe('in');
    });

    it('null where는 IsNull 연산자로 번역된다 — 그대로 넘기면 TypeORM이 조건을 무시한다', async () => {
      await adapter.findOne({ where: { deletedAt: null } });

      expect(operatorTypeOf(whereOf(repository.findOne), 'deletedAt')).toBe('isNull');
    });

    it('select는 컬럼 배열로 넘어간다 (select:false 컬럼을 명시적으로 요청하는 경로)', async () => {
      await adapter.findOne({ select: ['id', 'passwordHash'], where: { id: 'x' } });

      expect(repository.findOne).toHaveBeenCalledWith({
        select: ['id', 'passwordHash'],
        where: { id: 'x' },
      });
    });

    it('orderBy는 대문자 방향으로 번역된다', async () => {
      await adapter.findOne({ orderBy: { createdAt: 'desc', email: 'asc' }, where: { id: 'x' } });

      expect(repository.findOne).toHaveBeenCalledWith({
        order: { createdAt: 'DESC', email: 'ASC' },
        where: { id: 'x' },
      });
    });

    /**
     * TypeORM은 조건 없는 단건 조회를 거부한다
     * ("You must provide selection conditions in order to find a single row.").
     * 그 에러는 500이 되고 어느 계약을 어겼는지 알려주지 않으므로 여기서 먼저 잡는다.
     */
    it('빈 where는 거부한다 — DB까지 가지 않는다', async () => {
      await expect(adapter.findOne({ where: {} })).rejects.toThrow(RepositoryContractError);
      expect(repository.findOne).not.toHaveBeenCalled();
    });
  });

  /**
   * 조건이 조용히 사라지면 의도보다 많은 행에 닿는다.
   * `findMany({ where: { ownerId } })`에서 ownerId가 비었을 때 전체 행이 나가는 사고가
   * 이 계층에서 막혀야 한다.
   */
  describe('undefined where 값 차단', () => {
    it('findMany에서 undefined 값을 던진다 (전체 조회로 바뀌는 것을 막는다)', async () => {
      await expect(adapter.findMany({ where: { id: undefined } })).rejects.toThrow(
        RepositoryContractError,
      );
      expect(repository.find).not.toHaveBeenCalled();
    });

    it('에러 메시지가 어떤 키가 문제인지 알려준다', async () => {
      await expect(adapter.findMany({ where: { email: undefined } })).rejects.toThrow(
        /where\.email/,
      );
    });

    it.each([
      ['findOne', () => adapter.findOne({ where: { id: undefined } })],
      ['count', () => adapter.count({ id: undefined })],
      ['update', () => adapter.update({ id: undefined }, { email: 'x' })],
      ['remove', () => adapter.remove({ id: undefined })],
    ])('%s도 같이 막는다', async (_operation, call) => {
      await expect(call()).rejects.toThrow(RepositoryContractError);
    });
  });

  describe('findMany', () => {
    it('인자 없이 부르면 전체 조회다 (의도적으로 허용한다)', async () => {
      await adapter.findMany();

      expect(repository.find).toHaveBeenCalledWith({});
    });

    it('skip/take가 그대로 전달된다', async () => {
      await adapter.findMany({ skip: 20, take: 10, where: { deletedAt: null } });

      const [options] = repository.find.mock.calls[0] as [Record<string, unknown>];

      expect(options.skip).toBe(20);
      expect(options.take).toBe(10);
    });

    it('빈 배열은 In([])으로 번역된다 — "아무것도 매칭하지 않음"', async () => {
      await adapter.findMany({ where: { id: [] } });

      expect(operatorTypeOf(whereOf(repository.find), 'id')).toBe('in');
    });
  });

  describe('count', () => {
    it('where 없이 부르면 빈 옵션으로 센다', async () => {
      await expect(adapter.count()).resolves.toBe(3);
      expect(repository.count).toHaveBeenCalledWith({});
    });

    it('where가 있으면 번역해서 넘긴다', async () => {
      await adapter.count({ id: ['a', 'b'] });

      expect(operatorTypeOf(whereOf(repository.count), 'id')).toBe('in');
    });
  });

  describe('insert', () => {
    /**
     * save()가 아니라 insert()를 쓴다. save()는 PK 유무로 INSERT/UPDATE를 가르는 upsert라
     * 이미 있는 키로 부르면 유니크 위반이 아니라 기존 행을 덮어쓴다.
     * (덮어쓰지 않는다는 것 자체는 실제 DB에서만 확인할 수 있어 e2e가 맡는다.)
     */
    it('save를 쓰지 않는다', async () => {
      await adapter.insert({ email: 'user@example.com' });

      expect(repository.insert).toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('생성 컬럼을 엔티티에 병합해서 돌려준다', async () => {
      repository.insert.mockResolvedValue({ generatedMaps: [{ id: 'generated-id' }] });

      const created = await adapter.insert({ email: 'user@example.com' });

      expect(created).toMatchObject({ email: 'user@example.com', id: 'generated-id' });
    });

    it('생성 컬럼이 없으면 만든 엔티티를 그대로 돌려준다', async () => {
      const created = await adapter.insert({ id: 'given', email: 'user@example.com' });

      expect(created).toMatchObject({ email: 'user@example.com', id: 'given' });
      expect(repository.merge).not.toHaveBeenCalled();
    });
  });

  /**
   * 드라이버 에러코드를 도메인이 알 필요가 없게 만드는 계층이다 (constitution A-1-R).
   * 번역하지 않으면 `AllExceptionsFilter`가 500으로 만들어, 클라이언트가 "내 요청이 잘못됐다(409)"와
   * "서버가 고장났다(500)"를 구분할 수 없다.
   */
  describe('유니크 위반 번역', () => {
    it.each([
      ['postgres', { code: '23505', constraint: 'uq_users_email' }, 'uq_users_email'],
      ['mysql code', { code: 'ER_DUP_ENTRY' }, undefined],
      ['mysql errno', { errno: 1062 }, undefined],
    ])('%s 위반을 UniqueConstraintError로 바꾼다', async (_driver, driverError, constraint) => {
      repository.insert.mockRejectedValue(
        Object.assign(new Error('query failed'), { driverError }),
      );

      const error = await adapter.insert({ email: 'user@example.com' }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(UniqueConstraintError);
      expect((error as UniqueConstraintError).constraint).toBe(constraint);
    });

    it('원인 에러를 cause로 보존한다 (드라이버 정보를 잃지 않는다)', async () => {
      const driverFailure = Object.assign(new Error('query failed'), {
        driverError: { code: '23505' },
      });
      repository.insert.mockRejectedValue(driverFailure);

      const error = (await adapter
        .insert({ email: 'x' })
        .catch((e: unknown) => e)) as UniqueConstraintError;

      expect(error.cause).toBe(driverFailure);
    });

    it('update에서도 번역한다', async () => {
      repository.update.mockRejectedValue(
        Object.assign(new Error('query failed'), { driverError: { code: '23505' } }),
      );

      await expect(adapter.update({ id: 'x' }, { email: 'dup' })).rejects.toThrow(
        UniqueConstraintError,
      );
    });

    /**
     * 오분류하면 진짜 DB 장애가 409로 나가서 클라이언트가 재시도하지 않는다.
     * 모르는 에러는 그대로 올려보내야 한다.
     */
    it.each([
      ['다른 제약 위반(FK)', { code: '23503' }],
      ['연결 실패', { code: 'ECONNREFUSED' }],
      ['코드 없는 에러', {}],
    ])('%s는 그대로 다시 던진다', async (_label, driverError) => {
      const original = Object.assign(new Error('query failed'), { driverError });
      repository.insert.mockRejectedValue(original);

      await expect(adapter.insert({ email: 'x' })).rejects.toBe(original);
    });

    it('driverError가 없는 에러도 코드로 판단한다 (드라이버가 직접 던지는 경우)', async () => {
      repository.insert.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }));

      await expect(adapter.insert({ email: 'x' })).rejects.toThrow(UniqueConstraintError);
    });
  });

  describe('update', () => {
    it('조건과 patch를 그대로 넘기고 영향받은 행 수를 돌려준다', async () => {
      await expect(adapter.update({ id: 'x' }, { email: 'new@example.com' })).resolves.toBe(1);
      expect(repository.update).toHaveBeenCalledWith({ id: 'x' }, { email: 'new@example.com' });
    });

    /**
     * TypeORM은 빈 patch에 UpdateValuesMissingError를 던진다. "변경된 필드만 담는" 흔한 패턴에서
     * 바뀐 것이 없는 것은 버그가 아니므로 예외가 아니라 no-op으로 처리한다.
     */
    it('빈 patch는 DB에 가지 않고 0을 돌려준다', async () => {
      await expect(adapter.update({ id: 'x' }, {})).resolves.toBe(0);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('빈 where는 거부한다 — 조건 없는 대량 갱신 방지', async () => {
      await expect(adapter.update({}, { email: 'x' })).rejects.toThrow(RepositoryContractError);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('드라이버가 affected를 보고하지 않으면 0이다', async () => {
      repository.update.mockResolvedValue({ affected: undefined });

      await expect(adapter.update({ id: 'x' }, { email: 'x' })).resolves.toBe(0);
    });
  });

  describe('remove', () => {
    it('delete를 호출하고 영향받은 행 수를 돌려준다', async () => {
      await expect(adapter.remove({ id: 'x' })).resolves.toBe(2);
      expect(repository.delete).toHaveBeenCalledWith({ id: 'x' });
    });

    it('빈 where는 거부한다 — 전체 삭제 방지', async () => {
      await expect(adapter.remove({})).rejects.toThrow(RepositoryContractError);
      expect(repository.delete).not.toHaveBeenCalled();
    });

    it('드라이버가 affected를 보고하지 않으면 0이다', async () => {
      repository.delete.mockResolvedValue({ affected: null });

      await expect(adapter.remove({ id: 'x' })).resolves.toBe(0);
    });
  });
});
