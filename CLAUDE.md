# Barebones 작업 가이드

이 저장소는 도메인과 인증을 넣지 않는 NestJS 스캐폴드다. Claude는 `.claude/skills/`, Codex는
`.agents/skills/`만 사용한다. 설치된 Matt Pocock 스킬은 사용자가 해당 이름을 명시했을 때만 실행한다.

## 실행과 검증

```bash
cp .env.example .env
docker compose up -d --build

pnpm check:scaffold
pnpm check:observability
pnpm lint
pnpm typecheck
pnpm test
docker compose -f docker-compose.test.yml up -d --wait
pnpm test:e2e
docker compose -f docker-compose.test.yml down
pnpm build
```

## 경계

새 capability, 외부 I/O, persistence model, module communication을 추가하거나 바꿀 때
[`ARCHITECTURE.md`](./ARCHITECTURE.md)를 먼저 읽는다. 이 절은 항상 필요한 실행 요약만 둔다.

```text
adapter/in → application command/query → application port → adapter/out
```

- Controller는 HTTP 상태와 DTO 변환만 담당한다.
- CommandHandler는 상태 변경 사용 사례를 실행한다.
- QueryHandler는 조회 사용 사례를 실행한다.
- Handler가 use case다. 전달만 하는 별도 UseCase 계층을 겹쳐 만들지 않는다.
- HTTP, CLI, metrics가 같은 판단을 해야 하면 application coordinator를 공유한다.
- application/domain에서 TypeORM, Prisma, Mongoose, Redis, BullMQ 타입을 import하지 않는다.
- application이 외부 I/O를 사용하면 구현체 수와 관계없이 capability가 소유한 이름 있는 port를 둔다.
- RDB와 MongoDB를 함께 쓸 수 있지만 한 aggregate의 authoritative store는 하나다.
- 메시지 발행은 `MessageQueuePort`를 사용하고 BullMQ 타입을 호출부로 노출하지 않는다.
- BullMQ는 기본 messaging composition root다.
- broker 교체는 연결만이 아니라 delivery, retry, DLQ 정책을 함께 바꾸는 작업이다.
- 새 broker는 AppModule이 아니라 messaging infrastructure module에서 교체한다.

## 생성 시 선택

[barebones.config.json](./barebones.config.json)의 ORM/RDB 선택은 프로젝트 생성 시 한 번 정한다.
배포 시 `DB_TYPE`만 바꾸는 런타임 전환은 허용하지 않는다.

```text
AppModule → RdbDatabaseModule → selected ORM adapter → selected RDB
```

`pnpm build`는 먼저 `check:scaffold`를 실행한다. 선택과 패키지, 드라이버, 활성 모듈, Compose가
다르면 TypeScript 컴파일 전에 실패하고, 컴파일 뒤 source와 `dist` migration 목록도 비교한다.

## ESM과 migration

- package와 출력은 native ESM이다. TypeScript 상대 import에는 `.js` 확장자를 쓴다.
- 운영 스크립트는 `tsx`, TypeORM CLI는 `typeorm-ts-node-esm`을 사용한다.
- migration 경로는 `import.meta.url` 기준으로 source와 build 위치를 스스로 찾는다.
- TypeORM 생성 migration은 실행 전에 lint fix를 거친다. pre-commit도 type-only import를 고치지만
  생성 직후 앱/CLI 실행까지 대신 보호하지는 않는다.

## 툴체인 버전 정책

TypeScript는 **6.x 고정**이다. 7로 올리지 않는다. 2026-08-28 실측 근거:

- `@nestjs/cli`가 TypeScript의 programmatic compiler API를 요구하는데 7.0은 `tsc` 실행 파일만
  배포한다(`lib/typescript.js`가 없고 `exports["."]`가 `lib/version.cjs`를 가리킨다).
  `nest build`가 다음으로 실패한다.

  ```text
  The installed TypeScript version (7.0.2) does not expose the programmatic compiler API
  that the Nest CLI requires. TypeScript 7.0 ships the "tsc" executable only;
  the compiler API is expected to return in 7.1.
  Please install TypeScript 6 (e.g. "npm i -D typescript@^6") until then.
  ```

- `typescript-eslint`는 최신 `8.68.0`도 peer가 `<6.1.0`이라 7을 지원하지 않는다.
- `ts-node`(TypeORM CLI가 경유한다)도 같은 compiler API에 의존한다.
- 반면 `tsc --noEmit`, Vitest, `tsx` 기반 스크립트는 7.0.2에서 **이미 통과한다.**
  막히는 것은 `build`와 `lint` 둘뿐이다.

해제 조건은 둘 다 충족돼야 한다.

1. TypeScript **7.1**의 compiler API 복귀 (7.0 에러 메시지가 7.1을 명시한다)
2. `typescript-eslint`의 7 지원 릴리스

기다릴 가치는 있다. 같은 코드에서 direct executable `tsc --noEmit` warm run이 **6.0.3에서
1180–1230ms, 7.0.2에서 240–260ms**였다. 7.0은 네이티브(Go) 포트이고 플랫폼별 바이너리를
optionalDependencies로 싣는다.

### SWC 빌더는 쓰지 않는다

`nest build --builder swc`를 2026-08-28에 평가했고 채택하지 않았다.

- warm direct executable 기준(pre/postbuild 제외) build는 `nest build` **2.00–2.38s**에서
  `nest build --builder swc` **0.44–0.54s**로 빨라지지만 **타입 검사를 하지 않는다.** 속도의 출처가 검사 생략이다.
  TypeScript 7은 검사 자체를 빠르게 하므로 포기하는 것이 없다 — 그쪽을 기다리는 편이 낫다.
- `.swcrc`가 `tsconfig.json`과 별개의 **두 번째 진실 원천**이 된다. 이 저장소는 선언과 실제의
  drift를 build에서 막는 구조라 동기화가 필요한 축을 늘리지 않는다.
- decorator metadata가 SWC 재구현이다. 현재 코드는 통과하지만, 파생 프로젝트가 쓸 새 entity의
  optional·union·type-only import 경계는 검증되지 않았다. TypeORM 컬럼 타입과 DI가 여기 걸리고
  실패가 조용하다.
- `.swcrc` 없이는 `"type": "module"`인데도 CJS를 출력해 부팅에 실패한다
  (`ReferenceError: exports is not defined in ES module scope`).
- **TypeScript 7 차단을 풀지 못한다.** 빌더와 무관하게 Nest CLI가 compiler API를 먼저 요구한다.

## CQRS-lite

- create/update/delete: Command + CommandHandler + 이름 있는 write port
- read: Query + QueryHandler; 외부 I/O가 있으면 이름 있는 query port
- 범용 CRUD repository를 도메인 API로 노출하지 않는다.
- event sourcing, 별도 read database, eventual consistency는 제품 요구가 있을 때만 추가한다.

## DB 변경

ORM이나 RDB를 바꿀 때는 생성기를 사용한다. 생성기는 다음을 함께 교체한다.

- `RdbDatabaseModule`
- persistence adapter와 schema/entity
- migration CLI와 스크립트
- package dependencies
- Docker DB service와 기본 포트
- `active-scaffold.ts`와 예제 환경변수

설정 파일만 손으로 바꾸면 검증기가 build를 차단하는 것이 정상이다.

## 로컬 인프라

- RDB, MongoDB, Redis는 Docker volume을 사용한다.
- app은 필수 서비스의 `service_healthy`를 기다린다.
- health `200`은 활성 필수 의존성이 모두 준비됐다는 뜻이다.
- 실행 중 필수 의존성 장애는 `503`; 최초 연결 실패는 앱 부팅 실패가 될 수 있다.

## 문서와 스킬

GitHub Spec Kit/OMC/OMX 설정은 사용하지 않는다. 계획, 조사, 구현, 리뷰가 필요하면 설치된 Matt
Pocock 스킬을 사용자가 명시 호출한다. GitHub가 기본 issue tracker이며 프로젝트 문서는 단일
저장소 컨텍스트를 기준으로 작성한다.
