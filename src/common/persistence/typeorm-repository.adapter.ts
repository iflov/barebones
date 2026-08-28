import {
  type DeepPartial,
  type FindManyOptions,
  type FindOneOptions,
  type FindOptionsOrder,
  type FindOptionsSelect,
  type FindOptionsSelectByString,
  type FindOptionsWhere,
  In,
  IsNull,
  type ObjectLiteral,
  type QueryDeepPartialEntity,
  type Repository,
} from 'typeorm';

import {
  type FindCriteria,
  type FindOneCriteria,
  type IRepository,
  type Projection,
  RepositoryContractError,
  UniqueConstraintError,
  type WhereFilter,
} from './repository.port.js';

/**
 * `IRepository<T>`의 TypeORM 구현.
 *
 * **이 프로젝트에서 TypeORM 타입을 아는 곳은 세 군데뿐이다** (constitution A-1-R):
 * `src/common/persistence/`(이 파일), `src/config/`(연결 옵션), `src/database/`(마이그레이션).
 * `pnpm lint`가 나머지 전부에서 TypeORM import를 막는다.
 *
 * 다른 ORM으로 옮길 때 새로 쓰는 파일은 이것 하나다. 도메인 Repository는
 * `IRepository<T>`만 보고 있으므로 영향을 받지 않는다.
 *
 * ## 트랜잭션이 없는 이유
 *
 * 이 어댑터에는 트랜잭션 API가 없다 (constitution H-1). TypeORM은 세션/유닛오브워크 ORM이
 * 아니라 `save()`가 즉시 커밋되고, `EntityManager`를 포트에 노출하면 그것 자체가
 * "TypeORM을 다시 export하는 것"이 되어 포트의 목적(ORM 교체 가능성)이 사라진다.
 * 여러 테이블에 걸친 쓰기가 필요해지는 시점에 `plan.md`에서 방식을 먼저 정한다.
 */
export class TypeOrmRepositoryAdapter<T extends ObjectLiteral> implements IRepository<T> {
  constructor(private readonly repository: Repository<T>) {}

  // 아래 메서드들이 async인 이유: 계약 위반을 **거부된 Promise**로 내보내기 위함이다.
  // 동기 throw로 두면 `repo.findOne(...).catch(...)` 형태의 호출부가 예외를 놓치고,
  // Promise를 돌려주는 API에서 동기 예외가 튀어나오는 것 자체가 계약 위반이다.
  async findOne(criteria: FindOneCriteria<T>): Promise<T | null> {
    const where = this.toWhere(criteria.where, 'findOne');

    assertNonEmptyWhere(where, 'findOne');

    const options: FindOneOptions<T> = { where };

    this.applyProjection(options, criteria);

    return this.repository.findOne(options);
  }

  async findMany(criteria: FindCriteria<T> = {}): Promise<T[]> {
    return this.repository.find(this.toFindManyOptions(criteria));
  }

  async count(where?: WhereFilter<T>): Promise<number> {
    if (where === undefined) {
      return this.repository.count({});
    }

    return this.repository.count({ where: this.toWhere(where, 'count') });
  }

  /**
   * 진짜 INSERT.
   *
   * `save()`를 쓰지 않는 이유: `save()`는 PK 유무로 INSERT/UPDATE를 가르는 **upsert**라,
   * 이미 존재하는 키로 호출하면 유니크 위반이 아니라 **기존 행을 조용히 덮어쓴다.**
   * "중복 검사는 Service의 판단"(A-1)이라는 구조에서 검사와 저장 사이에 경합이 생기면
   * 먼저 저장된 데이터가 소실된다. `insert()`는 드라이버가 유니크 위반을 던지게 둔다.
   *
   * `generatedMaps`를 다시 병합하는 이유: `insert()`는 엔티티를 돌려주지 않으므로
   * 자동 증가 PK나 DB 기본값이 채워진 결과를 호출부가 받을 수 없다.
   */
  async insert(data: Partial<T>): Promise<T> {
    // create()는 DB를 건드리지 않는 동기 인스턴스 생성이다 (constitution H-1).
    const entity = this.repository.create(data as T);
    const result = await rethrowUniqueViolation(() =>
      this.repository.insert(entity as QueryDeepPartialEntity<T>),
    );
    const [generated] = result.generatedMaps;

    return generated === undefined
      ? entity
      : this.repository.merge(entity, generated as DeepPartial<T>);
  }

  async update(where: WhereFilter<T>, patch: Partial<T>): Promise<number> {
    const criteria = this.toWhere(where, 'update');

    assertNonEmptyWhere(criteria, 'update');

    // 빈 patch로 TypeORM update()를 부르면 UpdateValuesMissingError가 난다.
    // 갱신할 것이 없다는 것은 호출부의 버그가 아니라 흔한 정상 상태(변경된 필드만 담는 패턴)라
    // 예외 대신 no-op으로 처리한다.
    if (Object.keys(patch).length === 0) {
      return 0;
    }

    const result = await rethrowUniqueViolation(() =>
      this.repository.update(criteria, patch as QueryDeepPartialEntity<T>),
    );

    // 드라이버가 affected를 보고하지 않는 경우는 0으로 떨어뜨린다.
    return result.affected ?? 0;
  }

  async remove(where: WhereFilter<T>): Promise<number> {
    const criteria = this.toWhere(where, 'remove');

    assertNonEmptyWhere(criteria, 'remove');

    const result = await this.repository.delete(criteria);

    return result.affected ?? 0;
  }

  private toFindManyOptions(criteria: FindCriteria<T>): FindManyOptions<T> {
    const options: FindManyOptions<T> = {};

    this.applyProjection(options, criteria);

    if (criteria.where !== undefined) {
      options.where = this.toWhere(criteria.where, 'findMany');
    }

    if (criteria.skip !== undefined) {
      options.skip = criteria.skip;
    }

    if (criteria.take !== undefined) {
      options.take = criteria.take;
    }

    return options;
  }

  /**
   * `select` / `orderBy`를 옵션에 채운다.
   *
   * 새 객체를 만들어 합치지 않고 **받은 객체에 대입**한다. `{ ...projection, where }` 형태는
   * 결과 객체에 어떤 키가 있는지 코드에서 안 보이게 만든다 (constitution A-5).
   */
  private applyProjection(options: FindOneOptions<T>, projection: Projection<T>): void {
    if (projection.select !== undefined) {
      options.select = this.toSelect(projection.select);
    }

    if (projection.orderBy !== undefined) {
      options.order = this.toOrder(projection.orderBy);
    }
  }

  /**
   * 중립 필터 → TypeORM where.
   *
   * 배열은 `In(...)`, `null`은 `IsNull()`로 바꾼다. `where: { deletedAt: null }`을
   * 그대로 넘기면 TypeORM이 조건을 무시해서 삭제된 행까지 돌려주므로 여기서 반드시 변환한다.
   *
   * `undefined` 값은 **던진다.** 조용히 빼면 조건이 사라진 채로 쿼리가 나가서
   * 의도보다 많은 행에 닿는다 (포트 문서의 `WhereFilter` 주의 참고).
   */
  private toWhere(where: WhereFilter<T>, operation: string): FindOptionsWhere<T> {
    const result: Record<string, unknown> = {};
    const entries = Object.entries(where) as [string, unknown][];

    for (const [key, value] of entries) {
      if (value === undefined) {
        throw new RepositoryContractError(
          `${operation}: where.${key}가 undefined다. 조건을 선택적으로 넣으려면 키 자체를 빼야 한다 ` +
            `(...(value !== undefined && { ${key}: value })). undefined를 넘기면 조건이 사라져 ` +
            `의도보다 많은 행에 닿는다.`,
        );
      }

      if (value === null) {
        result[key] = IsNull();
        continue;
      }

      result[key] = Array.isArray(value) ? In(value) : value;
    }

    return result as FindOptionsWhere<T>;
  }

  /**
   * 컬럼 키 배열 → TypeORM select.
   *
   * TypeORM은 배열 형태(`FindOptionsSelectByString`)와 객체 형태(`FindOptionsSelect`)를
   * 둘 다 받지만 두 타입이 서로 겹치지 않아서 직접 캐스팅이 안 된다.
   * 런타임에는 배열이 유효한 입력이라 `unknown`을 경유한다.
   */
  private toSelect(select: readonly (keyof T)[]): FindOptionsSelect<T> {
    const byString: FindOptionsSelectByString<T> = [...select] as FindOptionsSelectByString<T>;

    return byString as unknown as FindOptionsSelect<T>;
  }

  private toOrder(orderBy: NonNullable<Projection<T>['orderBy']>): FindOptionsOrder<T> {
    const result: Record<string, 'ASC' | 'DESC'> = {};

    for (const [key, direction] of Object.entries(orderBy)) {
      if (direction === undefined) {
        continue;
      }

      result[key] = direction === 'desc' ? 'DESC' : 'ASC';
    }

    return result as FindOptionsOrder<T>;
  }
}

/**
 * 조건 없는 단건 조회·갱신·삭제를 막는다.
 *
 * TypeORM도 `delete({})`를 거부하지만 그건 `TypeORMError`로 나와서 500이 되고,
 * 어느 계약을 어겼는지 알려주지 않는다. 여기서 먼저 잡아 무엇이 잘못됐는지 말해준다.
 */
/**
 * 드라이버별 유니크 위반을 포트 에러 하나로 번역한다.
 *
 * **이 매핑이 어댑터에 있어야 하는 이유** (constitution A-1-R): `23505`는 postgres를 알아야
 * 해석되는 값이다. 도메인이 그걸 알면 DB를 바꿀 때 도메인 코드가 따라 바뀐다.
 *
 * 드라이버별 신호가 다 다르다:
 * - postgres(`pg`) — `code === '23505'`, 제약 이름은 `constraint`
 * - mysql / mariadb(`mysql2`) — `code === 'ER_DUP_ENTRY'` 또는 `errno === 1062`
 *
 * 알아보지 못한 에러는 **그대로 다시 던진다.** 유니크 위반으로 오분류하면
 * 진짜 DB 장애가 409로 나가서 클라이언트가 재시도하지 않는다.
 */
async function rethrowUniqueViolation<R>(run: () => Promise<R>): Promise<R> {
  try {
    return await run();
  } catch (error) {
    const constraint = uniqueConstraintOf(error);

    if (constraint === null) {
      throw error;
    }

    throw new UniqueConstraintError(constraint, { cause: error });
  }
}

/** 유니크 위반이면 제약 이름(모르면 `undefined`)을, 아니면 `null`을 돌려준다. */
function uniqueConstraintOf(error: unknown): string | undefined | null {
  const driverError = (error as { driverError?: unknown }).driverError ?? error;

  if (typeof driverError !== 'object' || driverError === null) {
    return null;
  }

  const { code, constraint, errno } = driverError as {
    code?: unknown;
    constraint?: unknown;
    errno?: unknown;
  };

  if (code === '23505') {
    return typeof constraint === 'string' ? constraint : undefined;
  }

  if (code === 'ER_DUP_ENTRY' || errno === 1062) {
    return undefined;
  }

  return null;
}

function assertNonEmptyWhere(where: object, operation: string): void {
  if (Object.keys(where).length > 0) {
    return;
  }

  throw new RepositoryContractError(
    `${operation}: where가 비어 있다. 조건 없는 ${operation}은 허용하지 않는다 ` +
      `(전체 행에 닿는다). 전체를 대상으로 해야 한다면 그 의도를 담은 메서드를 어댑터에 추가할 것.`,
  );
}
