import { getRepositoryToken } from '@nestjs/typeorm';
import { Entity, PrimaryColumn, type Repository } from 'typeorm';

import { createRepositoryToken, provideRepositoryPort } from './provide-repository-port.js';
import { TypeOrmRepositoryAdapter } from './typeorm-repository.adapter.js';

@Entity({ name: 'provide_repository_port_test_rows' })
class TestRow {
  @PrimaryColumn()
  id!: string;
}

const TEST_REPOSITORY = createRepositoryToken('TEST_REPOSITORY', TestRow);

describe('createRepositoryToken', () => {
  it('토큰과 엔티티를 함께 담는다 — 둘이 어긋날 수 없는 이유', () => {
    expect(TEST_REPOSITORY.entity).toBe(TestRow);
    expect(typeof TEST_REPOSITORY.token).toBe('symbol');
  });

  it('이름은 디버깅용으로 심볼에 붙는다', () => {
    expect(TEST_REPOSITORY.token.toString()).toContain('TEST_REPOSITORY');
  });

  it('같은 엔티티로 두 번 만들면 서로 다른 토큰이다 (참조 동일성으로 식별한다)', () => {
    const another = createRepositoryToken('TEST_REPOSITORY', TestRow);

    expect(another.token).not.toBe(TEST_REPOSITORY.token);
  });
});

describe('provideRepositoryPort', () => {
  it('토큰의 심볼로 프로바이더를 만든다', () => {
    expect(provideRepositoryPort(TEST_REPOSITORY)).toMatchObject({
      provide: TEST_REPOSITORY.token,
    });
  });

  it('토큰이 들고 있는 엔티티의 Repository를 주입받는다 — forFeature가 등록한 그 토큰', () => {
    expect(provideRepositoryPort(TEST_REPOSITORY)).toMatchObject({
      inject: [getRepositoryToken(TestRow)],
    });
  });

  it('팩토리가 어댑터를 만든다 (도메인 모듈은 어댑터 이름을 몰라도 된다)', () => {
    const provider = provideRepositoryPort(TEST_REPOSITORY) as {
      useFactory: (repository: Repository<TestRow>) => unknown;
    };

    expect(provider.useFactory({} as Repository<TestRow>)).toBeInstanceOf(TypeOrmRepositoryAdapter);
  });
});
