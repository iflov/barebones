# Barebones — 작업 가이드

NestJS + TypeORM + Redis 기반 백엔드 **스캐폴드**. 도메인 모듈은 없고, 앞으로도 없다.

**이 문서는 도구·환경·실행 방법을 다룬다. 설계 원칙과 품질 기준은 `.specify/memory/constitution.md`에 있다.**
둘이 충돌하면 constitution이 이긴다.

---

## 실행 — 전부 docker compose로 한다

호스트에서 `yarn start`를 쓰지 않는다. **로컬도 컨테이너에서 돌린다.**
로컬과 배포가 같은 이미지·같은 의존성·같은 node 버전을 쓰게 되고, "내 컴퓨터에서는 되는데"가
생기지 않는다. 호스트에 node를 맞춰 깔 필요도 없다.

```bash
cp .env.example .env
docker compose up -d --build       # postgres, redis, loki, prometheus, grafana, app
docker compose logs -f app         # 부팅 로그 확인
docker compose down                # 정리 (-v를 붙이면 볼륨까지)
```

`app`은 소스를 마운트한 **watch 모드**로 뜬다(`command: yarn start:dev`). `src/` / `test/` /
`config/`를 고치면 컨테이너가 알아서 다시 컴파일한다. **`--build`가 필요한 경우는 두 가지뿐**이다 —
`package.json`(의존성)이나 `Dockerfile`이 바뀌었을 때.

`node_modules`는 마운트하지 않는다. 이미지 안에서 설치된 것을 쓰므로 호스트에 없어도 된다.

### 명령어

컨테이너 안에서 실행한다. `app`이 떠 있어야 한다.

```bash
docker compose exec app yarn lint                   # eslint
docker compose exec app yarn typecheck              # tsc --noEmit
docker compose exec app yarn test                   # 단위 테스트
docker compose exec app yarn test:e2e               # e2e 테스트
docker compose exec app yarn check:observability    # 생성물이 최신인지 검사
docker compose exec app yarn generate:observability # prometheus.yml / grafana 대시보드 재생성

docker compose exec app yarn migration:generate     # 엔티티 변경분으로 마이그레이션 생성
docker compose exec app yarn migration:run
docker compose exec app yarn migration:revert
```

`app`을 띄우지 않고 한 번만 돌릴 때는 `run --rm`을 쓴다. 의존 서비스가 필요 없는 명령
(lint / typecheck / test)에 알맞다.

```bash
docker compose run --rm --no-deps app yarn lint
```

**생성물을 만드는 명령은 마운트된 디렉토리에 써야 호스트에 남는다.**
`generate:observability`가 그렇다 — `ops/`는 마운트돼 있지 않으므로 호스트에서 돌린다:

```bash
docker compose run --rm --no-deps -v "$PWD/ops:/app/ops" app yarn generate:observability
```

### 완료 게이트

기능이 "완료"이려면 아래가 전부 통과해야 한다 (constitution D-3). 통과 로그 없이 완료를 선언하지 않는다.

```bash
docker compose exec app sh -c 'yarn lint && yarn typecheck && yarn test && yarn test:e2e'
```

observability 관련 변경이 있었다면 `yarn check:observability`도 포함한다.

### 컨테이너 밖에서 돌려야 할 때

호스트에 node가 있고 `yarn install`을 해둔 경우에만 가능하다. 이 환경에서는
`node` / `yarn` / `npx` / `npm` / `corepack`이 **nvm lazy-load 셸 함수**로 정의돼 있어서,
비대화형 셸에서는 `_nvm_load: command not found`로 실패하는데 **exit code가 0으로 보고된다** —
"성공했지만 아무 일도 안 일어난" 상태가 된다. `unset -f`는 셸 상태가 호출 간에 유지되지 않아 소용없다.

절대 경로로 직접 실행해야 한다.

```bash
NODEBIN="$HOME/.nvm/versions/node/v24.18.1/bin"
export PATH="$NODEBIN:$PWD/node_modules/.bin:$PATH"
"$NODEBIN/node" "$NODEBIN/corepack" yarn <command>
```

---

## 디렉토리

```
src/
├── main.ts              부팅 + graceful shutdown (시그널 리스너는 여기서만 등록)
├── app.module.ts        무엇이 켜지는가 (DI 컨테이너 구성, imports 순서 = 초기화 순서)
├── app.setup.ts         요청이 어떻게 처리되는가 (전역 파이프라인 + CORS + Swagger)
├── config/              환경변수 → 각 모듈 옵션 팩토리
│   ├── env.validation.ts    ★ Joi 검증 실패 시 부팅 중단
│   ├── load-env.ts          ★ .env를 import 시점에 로드 (main.ts 첫 import)
│   ├── feature-flags.ts     ★ DI 이전에 결정되는 모듈 on/off
│   └── database.config.ts   ★ DB_TYPE 하나로 드라이버가 갈린다
├── common/
│   ├── persistence/     ★ 영속화 포트와 그 유일한 구현체 (TypeORM이 사는 곳)
│   ├── filters/         전역 예외 필터
│   ├── interceptors/    응답 봉투, 로깅
│   ├── decorators/      @RawResponse()
│   └── utils/           순수 유틸
├── infra/               외부 시스템 어댑터 (redis, queue, metrics, health)
├── health/              헬스체크
└── database/migrations/ 스키마 이력

specs/                   SDD 산출물 (기능당 디렉토리 하나, spec-kit이 생성)
.specify/                spec-kit 템플릿·스크립트 (CLI 소유, 직접 편집 금지)
.claude/skills/          speckit-* 스킬 (커밋 대상 — .gitignore에 예외로 열려 있다)
config/observability.config.json   관측 설정 소스
ops/                     생성물 (prometheus.yml, grafana 대시보드) — 직접 편집 금지
```

### 요청 파이프라인

```
helmet → CORS → ThrottlerGuard → LoggingInterceptor → ValidationPipe
  → Controller → Service → Repository → IRepository<T> → Adapter → DB
  → ResponseInterceptor ({ code, message, data }로 감쌈)
예외 → AllExceptionsFilter (HttpException이 아니면 전부 500)
```

### 기본 엔드포인트

- Swagger: `/docs` (`APP_SWAGGER_ENABLED=false`로 끌 수 있다)
- Health: `/v1/system/health`
- Metrics: `/v1/system/metrics`

---

## ⚠ 환경변수 로딩 순서 (constitution A-3 예외 1)

모듈 on/off 플래그(`REDIS_ENABLED` / `BULLMQ_ENABLED` / `PROMETHEUS_ENABLED`)는
**DI 컨테이너가 만들어지기 전에** 결정된다. 그래서 `main.ts`의 import 순서가 동작을 바꾼다.

```ts
import 'reflect-metadata';
import './config/load-env'; // ← 반드시 AppModule보다 위
...
import { AppModule } from './app.module'; // 이 줄에서 모듈 본문이 실행되고 플래그가 결정된다
```

- **함수 호출로는 못 고친다.** `import`는 호이스팅되어 어떤 문장보다 먼저 평가된다.
  `main.ts` 맨 위에서 `dotenv.config()`를 불러도 이미 늦다.
- 두 로더(`load-env.ts`와 `ConfigModule`)는 **같은 파일 목록**(`envFilePaths()`)을 쓴다.
  갈라지면 "부팅은 됐는데 플래그만 다른" 상태가 된다.
- 순서가 깨져도 **예외는 안 난다** — 모듈만 빠진 채 정상 부팅한다. 그래서 부팅 로그를 본다:

```
Boot config — redis=true bullmq=true metrics=true | env files: .env
```

기대와 다르면 `env files`를 먼저 본다. 파일을 못 읽은 것과 값이 그렇게 적힌 것은 다른 문제다.

## 배포 환경에서 챙길 것

| 환경변수                     | 안 하면 무슨 일이 나는가                                                                                                                                                                |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TRUST_PROXY_HOPS`           | 프록시 뒤에서 `req.ip`가 전부 프록시 주소가 되어 **rate limit이 전 사용자 공용 버킷**이 된다. ALB 하나면 `1`, CloudFront까지면 `2`. "전부 신뢰"는 지원하지 않는다(XFF 위조로 우회 가능) |
| `DB_SSL_CA`                  | 관리형 DB의 CA. 주면 **인증서 검증을 켠 채로** 붙는다                                                                                                                                   |
| `DB_SSL_REJECT_UNAUTHORIZED` | 기본 `true`. `false`는 TLS의 신원 확인을 꺼서 중간자가 모든 쿼리를 평문으로 본다 — 그런데 **연결은 되므로** 눈치채기 어렵다. production에서는 부팅이 거부된다                           |
| `APP_SWAGGER_ENABLED`        | 스펙 노출 여부. 끄는 수단이 없으면 "코드를 고쳐서 배포"가 유일한 방법이 된다                                                                                                            |

## 계층 나누는 기준 (constitution A-1)

| 계층       | 담는 것                                        | 파일              |
| ---------- | ---------------------------------------------- | ----------------- |
| Controller | HTTP 관심사만                                  | `*.controller.ts` |
| Service    | 비즈니스 **판단**                              | `*.service.ts`    |
| Repository | 테이블 접근 + 그 테이블을 알아야 쓸 수 있는 것 | `*.repository.ts` |

- 도메인 Repository는 **`IRepository<T>`(포트)를 주입받는다.** TypeORM을 직접 쓰지 않는다.
  → **`yarn lint`가 막는다** (아래 참고)
- Repository는 예외를 던지지 않는다. 없으면 `null`을 반환하고, 404로 바꿀지는 Service가 정한다.
- **Service에 Repository 호출만 넘기는 메서드를 만들지 않는다.** 조회만 필요하면
  Repository를 직접 주입받는다 (다른 도메인의 것이어도 된다 — A-2).
- **Repository에 포트 호출만 넘기는 메서드도 만들지 않는다** (A-1-W 방향 2).
  `findOne(criteria: FindCriteria<Foo>)` 같은 시그니처 금지 — 조건이 밖으로 나가면
  정규화·`select` 지식이 선택사항이 된다. 도메인 값을 받고 도메인 결과를 돌려준다.
  메서드가 늘어나는 게 부담이면 `findMany({ ownerId, search, page })`처럼 **도메인 파라미터로 묶는다.**
- 데이터를 **만들거나 바꿀 때는** 반드시 그 도메인의 Service를 거친다.
- **한 요청이 같은 DB의 여러 테이블에 쓰지 않는다** (H-1). 트랜잭션 인프라가 아직 없다.
  필요해지면 `plan.md`에서 방식을 먼저 정한다. `create()`+`save()`로 나눠도 트랜잭션은 안 생긴다 —
  `save()`는 즉시 커밋되고 바깥 트랜잭션에 자동 합류하지 않는다.

### 영속화 포트 쓰는 법

```ts
// src/common/persistence/repository.port.ts
interface IRepository<T> {
  findOne(criteria: FindOneCriteria<T>): Promise<T | null>; // where 필수
  findMany(criteria?: FindCriteria<T>): Promise<T[]>; // where 생략 = 전체 조회
  count(where?: WhereFilter<T>): Promise<number>;
  insert(data: Partial<T>): Promise<T>; // 진짜 INSERT — 덮어쓰지 않는다
  update(where: WhereFilter<T>, patch: Partial<T>): Promise<number>; // → affected rows
  remove(where: WhereFilter<T>): Promise<number>; // → affected rows
}
```

- `FindCriteria` = `{ where?, select?, orderBy?, skip?, take? }` / `FindOneCriteria` = `{ where, select?, orderBy? }`
- `where` 값이 배열이면 `IN`, `null`이면 `IS NULL`로 번역된다. 빈 배열은 "아무것도 매칭하지 않음"
- **범위·부분일치·OR은 없다** — 필요하면 포트를 넓히지 말고 어댑터에 이름 있는 메서드를 추가한다 (A-1-P)

**`RepositoryContractError`가 나는 경우** (전부 호출부 버그 → 500)

| 입력                             | 왜 막는가                                                              |
| -------------------------------- | ---------------------------------------------------------------------- |
| `where` 값이 `undefined`         | 조건이 사라져 `findMany`가 **전체 행**을 돌려준다. 키 자체를 빼야 한다 |
| `findOne`의 빈 `where`           | TypeORM이 단건 조회를 거부한다                                         |
| `update` / `remove`의 빈 `where` | 조건 없는 대량 갱신·전체 삭제                                          |

`update`의 **빈 `patch`는 예외가 아니다** — `0`을 돌려주는 no-op이다("변경된 필드만 담는" 패턴이 흔하다).

**`UniqueConstraintError`** — 유니크 위반은 드라이버 무관 포트 에러로 올라온다
(postgres `23505` / mysql·mariadb `1062`를 어댑터가 번역한다).
**Service가 `ConflictException`(409)으로 바꾼다** — 안 바꾸면 500이 되고 클라이언트는
"내 요청이 잘못됐다"와 "서버가 고장났다"를 구분할 수 없다.

"먼저 조회해서 있으면 거부"로 대체하지 않는다. 확인과 쓰기 사이의 간격 때문에 동시 요청에서
항상 깨지고, 트랜잭션으로도 못 막는다(넣으려는 행이 아직 없어서 잠글 대상이 없다).
진짜 방어선은 DB의 유니크 인덱스뿐이고 애플리케이션의 일은 **번역**이다.

⚠ soft delete를 쓰는 테이블은 유니크 인덱스를 **partial**로 만든다(`WHERE deleted_at IS NULL`).
아니면 "탈퇴한 이메일로 재가입 불가"가 된다 — 경합 없이 100% 재현되고, 탈퇴 기능이 생기기
전에는 드러나지 않는다 (constitution C-1).

**새 도메인을 만들 때 순서**

```
src/<domain>/
├── <domain>.entity.ts       엔티티
├── <domain>.repository.ts   ← IRepository<T>를 주입받는다 (TypeORM 아님)
├── <domain>.repository.spec.ts   포트를 mock하고 넘긴 조건을 단언한다 (D-1)
├── <domain>.service.ts      판단만
├── <domain>.service.spec.ts
├── <domain>.controller.ts
└── <domain>.module.ts       exports에 Repository/Service를 명시
```

`<domain>.module.ts`는 이렇게 배선한다:

```ts
// 토큰과 엔티티를 함께 만든다 — 둘이 어긋날 수 없다 (A-1-P)
export const FOO_REPOSITORY = createRepositoryToken('FOO_REPOSITORY', Foo);

@Module({
  imports: [TypeOrmModule.forFeature([Foo])], // 이게 없으면 포트 팩토리가 주입받을 것이 없다
  providers: [provideRepositoryPort(FOO_REPOSITORY), FooRepository, FooService],
  controllers: [FooController],
  exports: [FooRepository, FooService], // 포트 토큰은 export하지 않는다 (A-1-P)
})
export class FooModule {}
```

```ts
@Injectable()
export class FooRepository {
  // 주입 타입을 손으로 쓰지 않고 토큰에서 파생시킨다. @Inject()는 선언 타입을 검사하지 않으므로,
  // 직접 쓰면 엔티티가 바뀔 때 여기가 조용히 어긋난다.
  constructor(@Inject(FOO_REPOSITORY.token) private readonly foos: PortOf<typeof FOO_REPOSITORY>) {}

  // 도메인 시그니처만 노출한다. FindCriteria는 이 클래스 안에서 끝난다.
  findByName(name: string): Promise<Foo | null> {
    return this.foos.findOne({ where: { name: normalizeName(name) } });
  }
}
```

**테스트는 두 층으로 나눈다** (constitution D-1 / D-1-M)

- `<domain>.repository.spec.ts` — `IRepository<T>`를 mock하고 **넘긴 조건**을 단언한다
  (정규화된 값이 들어갔는지, `select`에 필요한 컬럼이 있는지).
- `test/*.e2e-spec.ts` — **mock으로 증명할 수 없는 것**을 실제 DB로 확인한다
  (`insert`가 덮어쓰지 않는지, `select: false`가 실제로 감춰지는지, DI 배선이 조립되는지).
  판별법: "구현을 통째로 mock으로 바꿔도 통과하는가?" 통과하면 그 테스트는 mock을 테스트하고 있다.

**lint가 막아주는 것**

`eslint.config.mjs`가 `@nestjs/typeorm`의 `InjectRepository` / `getRepositoryToken`과
`typeorm`의 주입·쿼리 표면(`Repository`, `DataSource`, `EntityManager`, `FindOneOptions`,
`FindManyOptions`, `FindOptionsWhere`, `FindOptionsSelect`, `FindOptionsOrder`, `DeepPartial`,
`QueryDeepPartialEntity`, `SelectQueryBuilder`, `UpdateResult`, `InsertResult`, `DeleteResult`,
`In`, `IsNull`, `Like`, `Not`)을
`src/common/persistence/**`, `src/config/**`, `src/database/**` **밖에서 금지**한다.
`src/**`와 `test/**` 양쪽에 적용된다 — 테스트에서 직접 조회해 검증하는 우회로를 막기 위함이다.
엔티티 정의 데코레이터(`@Entity` / `@Column`)는 쿼리 표면이 아니라 금지 목록에 없으므로
테스트가 픽스처 엔티티를 만드는 것은 가능하다.
위반하면 `yarn lint`가 실패하고 에러 메시지가 constitution 조항을 가리킨다.

**객체 spread도 막는다** (A-5). `{ ...base, x }`와 `...(cond ? { x } : {})`가 `no-restricted-syntax`에
걸린다. 객체 모양을 알려고 `base`를 찾아다니는 왕복이 읽는 흐름을 끊기 때문이다. 대신:

- 기본값 + 일부 교체 → **필드를 전부 적는다.** 공통 모양이 크면 그것을 만드는 함수를 둔다
- 조건부 필드 → 키를 두고 **값에 `undefined`** (`schema: isPostgres ? value : undefined`)
- 만든 뒤 채워야 함 → 객체를 만들고 **조건부로 대입** (`if (x !== undefined) options.x = x`)

배열 spread(`[...items]`)와 rest 파라미터(`del(...keys)`)는 대상이 아니다.
`Object.assign`은 lint를 통과하지만 **서드파티 표면 재수출(모듈 mock)에만** 쓴다 — 우회로가 아니다.

**lint가 못 막는 것** — 얇은 래퍼(A-1-W), Repository에서 예외 던지기, Repository에 비즈니스 판단 넣기.
"값을 더하는가"는 기계가 판단할 수 없어서 리뷰 몫이다.

그리고 위 차단은 **import 문만 본다.** Repository가 `findOne(criteria: FindCriteria<Foo>)`를
노출하면 호출부는 타입을 import하지 않고 객체 리터럴만 넘겨도 통과한다(TypeScript는 구조적 타입).
타입이 **번지는** 것은 막지만 **그런 시그니처를 갖는 것**은 못 막는다 — 그건 리뷰 몫이다.

---

## DB 바꾸기

**드라이버 교체** — 코드를 고치지 않는다.

```bash
DB_TYPE=postgres   # 기본. pg
DB_TYPE=mysql      # mysql2
DB_TYPE=mariadb    # mysql2
```

포트 기본값은 드라이버에서 결정된다(postgres 5432 / mysql·mariadb 3306). `DB_PORT`로 덮어쓴다.
`DB_SCHEMA`는 postgres에만 전달된다. 지원 드라이버를 추가할 때는
`database.config.ts`의 `SupportedDbType`, `env.validation.ts`의 `valid(...)`, 드라이버 패키지를
**같은 커밋에서** 갱신한다 (constitution A-3-D).

**ORM 교체** — `src/common/persistence/typeorm-repository.adapter.ts`를 새 어댑터로 바꾼다.
`IRepository<T>`를 구현하면 도메인 코드는 한 줄도 바뀌지 않는다. 어댑터 spec이 번역 계약을 잡아준다.

---

## SDD 워크플로우 (GitHub Spec Kit)

```
/speckit-specify <기능 설명>   →  specs/NNN-<slug>/spec.md    무엇을, 왜
  └ /speckit-clarify (선택)    →  모호한 지점을 질문으로 해소
/speckit-plan                  →  plan.md                     어떻게
/speckit-tasks                 →  tasks.md                    커밋 단위로 분해
  └ /speckit-analyze (선택)    →  constitution 대비 모순·누락 검사
/speckit-implement             →  코드 + 테스트 + 게이트 검증
```

기존 코드베이스를 명세 대비 점검하려면 `/speckit-converge`.

### 언제 SDD를 쓰나 (constitution F-4)

**새 엔드포인트 / 새 엔티티·마이그레이션 / 새 환경변수 / 계층 경계 변경**이 하나라도 포함되면
`/speckit-specify`부터 시작한다. 오타·문서·포맷팅·로그 문구 조정·의존성 범프는 그냥 고친다.

### 규칙 수정

`plan.md`나 `tasks.md`가 마음에 안 들면 **그 파일을 직접 고치지 말고** `/speckit-specify`로 돌아가
스펙을 재정의한다. 문서 간 일관성이 깨지는 것이 개별 문서의 완성도보다 비싸다.

프로젝트 규칙을 바꾸려면 `.specify/memory/constitution.md`를 직접 편집하고,
**규칙이 실제로 바뀐 경우에만** `.specify/memory/constitution-history.md`에 이유를 남긴다.
오타·렌더링 수정은 버전도 이력도 남기지 않고 그냥 겹쳐쓴다.
`/speckit-constitution`은 템플릿 기준으로 덮어쓸 수 있으므로 쓰지 않는다.

### 문서 경계

| 문서       | 담는 것                                         | 담지 않는 것                                 |
| ---------- | ----------------------------------------------- | -------------------------------------------- |
| `spec.md`  | 사용자 시나리오, FR 번호, 성공 기준, **비범위** | 파일 경로, 클래스명, 라이브러리, 테이블 설계 |
| `plan.md`  | 변경 파일 목록, 엔티티, API 계약, 시그니처      | 실제 구현 코드                               |
| `tasks.md` | 커밋 단위 작업, 완료 판정 명령                  | 설계 재논의                                  |

가장 흔한 실패는 **기술 결정이 `spec.md`로 새어 들어오는 것**이다.
판별법: "구현 방법이 바뀌어도 이 문장이 그대로인가?" → 아니면 `plan.md`로 옮긴다.

두 번째로 흔한 실패는 **비범위를 비워두는 것**이다. 비워두면 구현 범위가 번진다. 최소 2개는 쓴다.

### 알아둘 것

기능 설명을 한글로만 쓰면 디렉토리 이름이 `001-`로 비어버린다. 슬러그 생성기가 영숫자만 남기기 때문이다.
짧은 영문 이름을 같이 준다.

```
/speckit-specify 파일 업로드 기능 (short name: file-upload)
```

---

## compose 스택 구성

`app`은 postgres와 redis를 **`service_healthy`로 기다린다** — `service_started`로 두면
의존성이 아직 응답하지 않는 상태에서 앱이 떠서 부팅 직후 요청이 실패한다.

Redis는 AOF(`appendfsync everysec`) + RDB + `redis-data` 볼륨으로 구성돼 있다.
**볼륨 없이 AOF만 켜는 것은 무의미하다** — `/data`가 컨테이너와 함께 사라진다.

`app` 이미지의 기본 `CMD`는 `yarn start:prod`(빌드 결과 실행)이고, compose가 이것을
`yarn start:dev`로 덮어쓴다. 즉 **같은 이미지로 배포와 로컬 개발을 둘 다 한다** —
차이는 실행 커맨드와 소스 마운트뿐이다.

### 관측 설정을 바꾸는 방법

`.env`가 아니라 `config/observability.config.json`을 고치고 생성기를 돌린다.
`ops/`는 마운트돼 있지 않으므로 생성물이 호스트에 남으려면 그때만 마운트해서 돌린다.

```bash
docker compose run --rm --no-deps -v "$PWD/ops:/app/ops" app yarn generate:observability
docker compose exec app yarn check:observability   # drift 검사
docker compose up -d --build                       # 스택 반영
```

`ops/**`를 직접 편집하지 않는다 (constitution A-4). 이 파일들은 `.prettierignore`에 있으니
포맷터를 다시 걸지 않는다 — 걸면 커밋마다 `check:observability`가 stale로 실패한다.
