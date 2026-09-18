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
adapter/in → application/ports/in → application service → application/ports/out → adapter/out
```

- Controller는 HTTP 상태와 DTO 변환만 담당한다.
- capability가 밖에 공개하는 것은 `application/ports/in/`의 interface + Symbol 토큰과 `domain/`의
  타입·순수 함수 둘뿐이다. 구현 클래스는 module `exports`에 싣지 않는다.
- Application service가 use case다. 전달만 하는 별도 UseCase 계층을 겹쳐 만들지 않는다.
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

## NestJS 12 현재 기준 (2026-09-18)

공식 npm registry와 각 package의 peer dependency를 다시 확인해 다음 Nest 12 조합을 고정했다.

- `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`, `@nestjs/testing`,
  `@nestjs/cli`, `@nestjs/schematics`: **12.0.3**
- `@nestjs/bullmq`, `@nestjs/cache-manager`, `@nestjs/config`, `@nestjs/mongoose`:
  **12.0.0** (각 package의 현재 Nest 12 최신)
- `@nestjs/swagger`, `@nestjs/typeorm`: **12.0.1** (각 package의 현재 Nest 12 최신)
- `@nestjs/throttler`: **6.7.0** — `@nestjs/core/common ^7 || ^8 || ^9 || ^10 || ^11 || ^12`
- `nestjs-pino`: **5.2.0** — `@nestjs/core/common ^11.0.8 || ^12.0.2`, `pino ^10`,
  `pino-http ^11`, Node `>=22.12`; 이 저장소의 Node `>=24`와 core/common 12.0.3이 충족한다.

그래서 `pnpm-workspace.yaml`의 `peerDependencyRules.allowedVersions` 우회는 삭제했다.
Nest 12 출시 때 추가했던 `minimumReleaseAgeExclude`도 제거했다. 다만 6.7.0은 선택 당시
pnpm minimum-release-age cutoff 안에 있었으므로, 해당 package 하나만 window가 끝날 때까지 예외로
남긴다. `pnpm install --frozen-lockfile`이 peer warning 없이 정책 검증까지 통과해야 이 결론이 유지된다.

### 이 스캐폴드에서 확인한 12.0.2 / 12.0.3 영향

- 12.0.2의 microservice/socket adapter 수정은 이 저장소가 그 adapter를 설치하지 않아 적용 대상이
  아니다. core의 반복 shutdown listener 정리는 이 저장소가 `enableShutdownHooks()` 대신
  `main.ts`의 단일 signal handler를 쓰므로 현재 shutdown path를 바꾸지 않는다. `ParseArrayPipe`,
  UUID validation 관련 수정도 현 scaffold의 endpoint에는 해당 pipe 사용이 없다.
- 12.0.3은 common의 UUID/proto-key 처리 보완과 platform-express의 multer 2.4.0 갱신을 포함한다.
  이 스캐폴드는 UUID pipe 또는 multipart controller를 제공하지 않으므로 새 HTTP surface 변화는 없다.
  built image와 E2E로 ESM boot, TypeORM migration artifact 탐색, health 200/503 mapping, Swagger를
  재확인한다.
- `nestjs-pino` v5는 exports map을 추가하고 Nest 12.0.2+를 요구한다. 이 프로젝트는 public entry
  point만 사용하므로 deep-import migration이 없다. 실제 `pino-http` regression test가 health/metrics의
  request log 0건, `X-Request-Id` 생성·전파·응답, 일반 route의 `request completed` 1건을 확인한다.
  Loki transport의 app/env labels도 기존 설정을 유지한다.
- throttler 6.7은 기본 IPv6 tracker를 `/64`로 정규화한다. IPv4와 custom tracker는 바뀌지 않지만,
  proxy hop을 신뢰한 뒤의 `req.ip`가 IPv6이면 같은 `/64`가 하나의 bucket을 공유한다. IPv6 privacy
  address 회전으로 limit을 피하는 경로를 막기 위해 이 기본값을 유지한다. trade-off는 같은 `/64`의
  서로 다른 익명 사용자가 더 일찍 429를 공유할 수 있다는 점이며, 필요하면 명시적으로
  `ipv6SubnetPrefix: 128`을 설정해 이전 per-address behaviour로 되돌릴 수 있다.

### Container build 경계

`pnpm build`의 scaffold 검증은 `test/load-test-env.ts`와 `test/persistence.e2e-spec.ts`를 입력으로
읽는다. 따라서 Docker build context에서 `test/`를 제외하면 host build는 통과해도 image build는
`ENOENT` 또는 scaffold consistency failure로 깨진다. test source는 tsconfig build output과 final runtime
stage 모두에서 제외되므로 build context에는 남기고 final stage에는 `dist`, `config`, production
dependencies만 복사한다.

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
- `ts-node`(TypeORM CLI가 경유한다)도 같은 compiler API에 의존한다. 2026-09-11에
  `pnpm typeorm migration:show`로 실측했고 DB 연결 전에 다음으로 죽는다.

  ```text
  TypeError: Cannot read properties of undefined (reading 'fileExists')
      at readConfig (ts-node/dist/configuration.js:91:33)
  ```

- 반면 `tsc --noEmit`, Vitest, `tsx` 기반 스크립트는 7.0.2에서 **이미 통과한다.**
  막히는 것은 `build`, `lint`, TypeORM CLI 셋이다.

해제 조건은 둘 다 충족돼야 한다.

1. TypeScript **7.1**의 compiler API 복귀 (7.0 에러 메시지가 7.1을 명시한다)
2. `typescript-eslint`의 7 지원 릴리스

기다릴 가치는 있다. 같은 코드에서 direct executable `tsc --noEmit` warm run이 **6.0.3에서
1180–1230ms, 7.0.2에서 240–260ms**였다. 7.0은 네이티브(Go) 포트이고 플랫폼별 바이너리를
optionalDependencies로 싣는다.

### 2026-09-11 재검증

같은 커밋(`757037d`)에서 6.0.3 / 7.0.2 / `7.1.0-dev.20260910.1` / side-by-side 네 구성으로
`check:scaffold`, `check:observability`, `typecheck`, `lint`, `test`, `build`, `tsc -p tsconfig.build.json`
emit, TypeORM CLI를 돌렸다. 해제 조건은 **둘 다 여전히 미충족**이다.

- TypeScript stable latest는 7.0.2. 7.1은 nightly(`next` 태그)만 있고, nightly도 `exports["."]`가
  `./lib/version.cjs`라 compiler API가 없다. 7.0.2와 결과가 동일하다.
- `typescript-eslint` 최신 `8.70.0`도 peer가 `<6.1.0`. 추적 이슈 #10940은 open이고 milestone이 없다.
- 7.x에서 `lint`는 peer 경고가 아니라 ESLint 프로세스가 `Error [ERR_INTERNAL_ASSERTION]`으로 죽는다.
- 7.0.2 `tsc`의 emit 결과는 6.0.3과 JS 54파일이 byte 단위로 동일하다. d.ts 1건만 따옴표 스타일이
  다르다. 데코레이터 metadata 출력 차이는 없다.

MS 7.0 공지의 공식 side-by-side 구성은 이 저장소에서 e2e까지 **전부 통과**했다.
`require('typescript')`는 6 API(Nest CLI, ts-node, typescript-eslint가 사용), `tsc` 실행 파일은 7이 된다.

```json
"typescript": "npm:@typescript/typescript6@^6.0.2",
"@typescript/native": "npm:typescript@^7.0.2"
```

| 구성         | typecheck cold / warm | lint | build | test              | TypeORM CLI |
| ------------ | --------------------- | ---- | ----- | ----------------- | ----------- |
| 6.0.3        | 2.70s / 1.48s         | 통과 | 통과  | 통과              | 통과        |
| 7.0.2        | 1.68s / 0.53s         | 실패 | 실패  | 통과              | 실패        |
| side-by-side | 0.67s / 0.53s         | 통과 | 통과  | 통과 (+e2e 20/20) | 통과        |

그래도 **채택하지 않는다.** `pnpm typecheck`(7)와 `nest build`(6)가 서로 다른 검사기가 되어
typecheck 통과가 build 통과를 보장하지 않는 drift 축이 하나 생긴다. SWC를 거부한 이유와 같다.
절대 시간 이득이 1~2초라 그 비용을 정당화하지 못한다. 미검증 항목은 pre-commit hook, IDE tsserver
버전 선택, Dockerfile 빌드다.

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

## Port 경계

- 소비자는 상대의 inbound port를 `@Inject(TOKEN)`으로 받고 타입은 `import type`으로 본다.
- 외부 I/O는 구현체가 하나여도 `application/ports/out/`에 이름 있는 port를 둔다.
- 전역 `CommandBus`/`QueryBus`는 기본이 아니다. 같은 메시지를 여러 inbound가 보내거나 dispatch
  자체가 값을 할 때만 쓴다(`ARCHITECTURE.md`의 「전역 Command/Query 버스는 기본이 아니다」).
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
