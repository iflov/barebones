import type { Provider, Type } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { ObjectLiteral, Repository } from 'typeorm';

import type { IRepository } from './repository.port';
import { TypeOrmRepositoryAdapter } from './typeorm-repository.adapter';

/**
 * 엔티티와 묶인 주입 토큰.
 *
 * 토큰과 엔티티를 **한 번에 같이** 만들기 때문에 둘이 어긋날 수 없다.
 * 전에는 `provideRepositoryPort(FOO_REPOSITORY, Bar)`처럼 잘못 배선해도 컴파일이 통과했고,
 * 런타임에 다른 테이블을 조회하는 Repository가 조용히 만들어졌다.
 */
export interface RepositoryToken<T extends ObjectLiteral> {
  /** Nest DI 토큰. `@Inject()`에 넘기는 값. */
  readonly token: symbol;
  readonly entity: Type<T>;
}

/**
 * 토큰에서 포트 타입을 끌어낸다.
 *
 * 주입 파라미터의 타입을 손으로 다시 쓰지 않게 하는 것이 목적이다 —
 * Nest의 `@Inject()`는 선언한 타입을 검사하지 않으므로, 타입을 **토큰에서 파생**시켜야
 * 엔티티가 바뀔 때 주입 지점이 같이 따라온다.
 *
 * ```ts
 * constructor(@Inject(FOO_REPOSITORY.token) private readonly foos: PortOf<typeof FOO_REPOSITORY>) {}
 * ```
 */
export type PortOf<Tk> = Tk extends RepositoryToken<infer T> ? IRepository<T> : never;

/**
 * 엔티티 하나에 대한 주입 토큰을 만든다.
 *
 * `T`는 `entity`에서 추론되므로 `createRepositoryToken<Foo>('FOO', Bar)`는 컴파일되지 않는다.
 * 이름은 디버깅용이며 DI 식별에는 `Symbol`의 참조 동일성만 쓰인다.
 */
export function createRepositoryToken<T extends ObjectLiteral>(
  name: string,
  entity: Type<T>,
): RepositoryToken<T> {
  return { entity, token: Symbol(name) };
}

/**
 * `RepositoryToken`에 대한 `IRepository<T>` 프로바이더를 만든다.
 *
 * 이 헬퍼가 존재하는 이유는 **도메인 모듈이 TypeORM을 몰라도 되게 하는 것**이다.
 * 이게 없으면 각 도메인 모듈이 `getRepositoryToken`이나 `DataSource`를 직접 잡아야 하고,
 * 그러면 TypeORM이 도메인 계층으로 번져서 A-1-R이 무의미해진다.
 *
 * 사용법 (`<domain>.module.ts`):
 *
 * ```ts
 * export const FOO_REPOSITORY = createRepositoryToken('FOO_REPOSITORY', Foo);
 *
 * @Module({
 *   imports: [TypeOrmModule.forFeature([Foo])],
 *   providers: [provideRepositoryPort(FOO_REPOSITORY), FooRepository],
 *   exports: [FooRepository],
 * })
 * ```
 *
 * `TypeOrmModule.forFeature([Foo])`는 반드시 필요하다 — 그게 없으면 이 프로바이더가
 * 주입받을 `Repository<Foo>`가 컨테이너에 등록되지 않는다.
 *
 * **`IRepository<T>`를 도메인 밖으로 export하지 않는다** (constitution A-1-P).
 * 모듈이 `exports`에 넣는 것은 도메인 Repository 클래스이고, 포트는 그 안에서만 쓰인다.
 */
export function provideRepositoryPort<T extends ObjectLiteral>(
  repositoryToken: RepositoryToken<T>,
): Provider {
  return {
    inject: [getRepositoryToken(repositoryToken.entity)],
    provide: repositoryToken.token,
    useFactory: (repository: Repository<T>): IRepository<T> =>
      new TypeOrmRepositoryAdapter<T>(repository),
  };
}
