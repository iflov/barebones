/**
 * 영속화 포트 (constitution A-1-P).
 *
 * 도메인 Repository가 의존하는 **유일한** 영속화 계약이다. TypeORM 타입은 이 파일에 없다.
 * 구현체는 `src/common/persistence/`의 어댑터뿐이고, 다른 ORM/드라이버로 갈아탈 때
 * 어댑터만 새로 쓰면 도메인 코드는 한 줄도 바뀌지 않는다.
 *
 * ## 이 포트가 놓인 위치가 중요하다
 *
 * ```
 * Service  →  <Domain>Repository  →  IRepository<T>  →  TypeOrmRepositoryAdapter  →  DB
 *          ↑                      ↑
 *   도메인 시그니처만        여기가 포트 경계
 * ```
 *
 * 포트는 **Repository와 ORM 사이**에 있다. Service와 Repository 사이가 아니다.
 * 그래서 아래 `FindCriteria` 같은 범용 조회 조건은 **도메인 Repository 안에서만** 쓰이고,
 * 절대 Service로 새어 나가지 않는다 (A-1-W).
 *
 * 이 구분이 없으면 의존성 역전이 규칙을 무너뜨린다. 포트를 Service 쪽으로 한 칸만 올려서
 * Service가 `findOne({ where: { email } })`을 직접 쓸 수 있게 되는 순간,
 * "이 테이블은 정규화된 값으로만 조회한다" 같은 불변식이 **선택사항**이 된다.
 * 컴파일도 되고 테스트도 통과하고, 운영에서 조용히 빈 결과가 나온다.
 *
 * 그래서 이 포트의 목적은 딱 하나다 — **ORM 교체 가능성**. 호출 편의가 아니다.
 *
 * ## 계약을 어기면 즉시 던진다
 *
 * 아래 세 경우는 **호출부의 버그**이므로 조용히 넘기지 않고 `RepositoryContractError`를 던진다.
 * 전부 "조건이 사라져서 의도보다 많은 행에 닿는" 사고로 이어지는 입력이다.
 *
 * - `where`의 값이 `undefined` — 필터 변수가 비었는데 조건만 사라진 경우
 * - `findOne` / `update` / `remove`에 빈 `where`
 * - 조건 없이 하는 대량 갱신·삭제
 */

/** 정렬 방향. ORM 중립 표현을 쓴다(`'ASC'`가 아니라 `'asc'`). */
export type SortDirection = 'asc' | 'desc';

/**
 * 동등 비교 기반 필터.
 *
 * - 값이 배열이면 `IN` (빈 배열은 "아무것도 매칭하지 않음")
 * - 값이 `null`이면 `IS NULL`
 * - 값이 `undefined`면 **에러** — 아래 주의 참고
 *
 * 범위·부분일치·OR 같은 연산자는 **의도적으로 없다.** 넣기 시작하면 이 타입이 곧
 * ORM 쿼리 언어가 되고, 어댑터를 갈아탈 때 번역해야 할 표면이 무한히 늘어난다.
 * 그런 쿼리가 필요하면 어댑터에 **이름 있는 메서드**를 추가하는 쪽이 맞다
 * (constitution A-1-P의 "포트를 넓히지 않는다" 참고).
 *
 * ⚠ **`undefined`를 값으로 넘기면 안 된다.** 조건을 조용히 빼버리면
 * `findMany({ where: { ownerId } })`에서 `ownerId`가 비었을 때 **전체 행이 반환된다.**
 * 컴파일 에러도 예외도 없이 다른 사용자의 데이터가 나가는 종류의 사고다.
 * 그래서 어댑터는 `undefined` 값을 발견하면 `RepositoryContractError`를 던진다.
 * 조건을 선택적으로 넣어야 한다면 **키 자체를 넣지 않는다** (`...(id !== undefined && { id })`).
 */
export type WhereFilter<T> = {
  readonly [K in keyof T]?: T[K] | readonly T[K][] | null;
};

/** 조회할 컬럼과 정렬. `findOne`과 `findMany`가 공유한다. */
export interface Projection<T> {
  /**
   * 조회할 컬럼 목록.
   *
   * 엔티티에서 `select: false`로 감춘 컬럼은 여기에 명시해야 조회된다.
   * 그 지식은 도메인 Repository가 갖는다 — 호출부가 알 필요가 없어야 한다.
   */
  readonly select?: readonly (keyof T)[];
  readonly orderBy?: { readonly [K in keyof T]?: SortDirection };
}

/**
 * 여러 행 조회 조건.
 *
 * `where`를 생략하면 **전체 조회**다. 의도적으로 전체를 읽는 경우에만 생략한다.
 */
export interface FindCriteria<T> extends Projection<T> {
  readonly where?: WhereFilter<T>;
  readonly skip?: number;
  readonly take?: number;
}

/**
 * 단건 조회 조건.
 *
 * `where`가 **필수**다. TypeORM은 조건 없는 단건 조회를 거부하므로
 * (`You must provide selection conditions in order to find a single row.`)
 * 그 제약을 런타임 예외가 아니라 타입으로 올려둔다.
 * `skip` / `take`도 의미가 없어서 받지 않는다.
 */
export interface FindOneCriteria<T> extends Projection<T> {
  readonly where: WhereFilter<T>;
}

/**
 * 포트 계약 위반.
 *
 * 의존 서비스 장애가 아니라 **호출부의 버그**다. `HttpException`이 아니므로
 * `AllExceptionsFilter`가 500으로 만든다 — 그게 맞는 신호다.
 */
export class RepositoryContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RepositoryContractError';
  }
}

/**
 * 유니크 제약 위반.
 *
 * **드라이버 에러코드를 도메인이 알 필요가 없게 만드는 것이 이 클래스의 목적이다.**
 * postgres는 `23505`, mysql은 `1062`, sqlite는 메시지 문자열로 알려준다 — 그 지식은
 * 어댑터(A-1-R)에 있고, 밖으로는 이 하나의 타입만 나온다. DB를 바꿔도 호출부는 안 바뀐다.
 *
 * ## 왜 예외를 잡아서 다시 던지나 — 사전 조회로는 못 막는다
 *
 * "먼저 조회해서 있으면 거부"(check-then-act)는 **DB가 강제하는 제약을 애플리케이션이
 * 흉내내는 것**이다. 확인과 쓰기 사이에 간격이 있는 한 동시 요청 둘이 모두 "없음"을 보고
 * 둘 다 쓰기를 시도한다. 트랜잭션도 못 막는다 — 넣으려는 행이 아직 없으니 **잠글 대상이 없다.**
 * 진짜 방어선은 DB의 유니크 인덱스 하나뿐이고, 애플리케이션이 할 일은 그걸 대신하는 게 아니라
 * **터졌을 때 올바른 의미로 번역**하는 것이다.
 *
 * ## 이 예외를 받은 Service가 할 일
 *
 * `ConflictException`(409)으로 바꾼다. 그 판단은 Service의 몫이다 (A-1) —
 * 같은 위반이 어떤 기능에서는 409이고 다른 기능에서는 "이미 있으니 그것을 쓴다"일 수 있다.
 * 번역하지 않으면 `AllExceptionsFilter`가 500으로 만들고, 클라이언트는 **자기 요청이
 * 잘못된 것(409)인지 서버가 고장난 것(500)인지 구분할 수 없다.**
 *
 * ⚠ soft delete를 쓰는 테이블에서는 유니크 인덱스를 **partial**로 만들어야
 * (`WHERE deleted_at IS NULL`) "탈퇴한 이메일로 재가입 불가" 같은 상태가 생기지 않는다.
 * 이건 제품 결정이므로 그 기능의 `plan.md`에서 정한다.
 */
export class UniqueConstraintError extends Error {
  constructor(
    /** 위반한 제약/인덱스 이름. 드라이버가 알려주지 않으면 `undefined`. */
    readonly constraint: string | undefined,
    options?: { cause?: unknown },
  ) {
    super(
      constraint === undefined
        ? 'Unique constraint violated'
        : `Unique constraint violated: ${constraint}`,
      options,
    );
    this.name = 'UniqueConstraintError';
  }
}

/**
 * 한 엔티티에 대한 영속화 계약.
 *
 * **조회 실패에 예외를 쓰지 않는다.** 없으면 `null`을 돌려주고, 그걸 404로 바꿀지는
 * Service가 정한다 (constitution A-1). 예외는 계약 위반일 때만 던진다.
 */
export interface IRepository<T> {
  /** @throws RepositoryContractError `where`가 비었거나 `undefined` 값을 담고 있으면 */
  findOne(criteria: FindOneCriteria<T>): Promise<T | null>;
  /** @throws RepositoryContractError `where`가 `undefined` 값을 담고 있으면 */
  findMany(criteria?: FindCriteria<T>): Promise<T[]>;
  /** @throws RepositoryContractError `where`가 `undefined` 값을 담고 있으면 */
  count(where?: WhereFilter<T>): Promise<number>;
  /**
   * 새 행을 저장한다. **덮어쓰지 않는다** — 같은 키가 이미 있으면 유니크 위반이다.
   * 생성 컬럼(자동 증가 PK, DB 기본값)은 반환된 엔티티에 채워진다.
   *
   * @throws UniqueConstraintError 유니크 제약을 위반하면 (드라이버 무관)
   */
  insert(data: Partial<T>): Promise<T>;
  /**
   * 조건에 맞는 행을 부분 갱신하고 **영향받은 행 수**를 돌려준다.
   * `patch`가 비어 있으면 아무것도 하지 않고 `0`을 돌려준다.
   *
   * @throws RepositoryContractError `where`가 비었거나 `undefined` 값을 담고 있으면
   * @throws UniqueConstraintError 갱신 결과가 유니크 제약을 위반하면
   */
  update(where: WhereFilter<T>, patch: Partial<T>): Promise<number>;
  /**
   * 조건에 맞는 행을 삭제하고 **영향받은 행 수**를 돌려준다.
   *
   * @throws RepositoryContractError `where`가 비었거나 `undefined` 값을 담고 있으면
   */
  remove(where: WhereFilter<T>): Promise<number>;
}
