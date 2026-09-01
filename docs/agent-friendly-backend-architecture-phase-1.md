# Agent-Friendly Backend Architecture — Phase 1 Repository Analysis

분석 기준: `7acc07e609d02f5ea645f393787a51f3819509e4` (`main`, 2026-09-01)

이 보고서는 production code를 바꾸지 않고 현재 저장소의 실행 코드, 테스트, 설정, CI, 최근 12개월 Git 이력을 조사한 결과다. `src/`에는 제품 도메인 capability가 없으므로 주문·사용자 같은 가상의 경계를 추정하지 않는다.

> 후속 의사결정: Phase 1.5에서 외부 I/O port를 구현체 수와 관계없이 mandatory로 선택했다. 현재
> 적용 규칙은 `ARCHITECTURE.md`가 소유하며, 이 문서의 선택지와 권고안은 결정 전 분석 기록이다.

# A. Executive Summary

1. 이 저장소는 제품 백엔드가 아니라 NestJS 파생 프로젝트용 scaffold다. 실제 runtime capability는 health, metrics, Redis, queue, RDB/Mongo 연결과 구성 검증이다 (`src/app.module.ts`, `src/health/`, `src/infra/`).
2. Health는 현재 가장 분명한 feature-first 모듈이다. HTTP → CQRS query → coordinator → indicator port → RDB/Redis/Mongo/OS adapter 경로가 실제로 존재한다 (`src/health/health.module.ts:39-60`).
3. Production TypeORM entity, relation, business repository, transaction은 하나도 없다. TypeORM reality는 공용 `IRepository<T>`/adapter와 테스트 픽스처 entity에 한정된다 (`src/common/persistence/`, `test/persistence.e2e-spec.ts:29-46`). 따라서 persistence/domain 모델 정책을 현 코드만으로 전역 확정할 근거가 부족하다.
4. 결정적 피드백은 이미 일부 강하다. ESLint가 TypeORM query surface의 import 위치를 제한하고, scaffold/observability 스크립트가 구성 일치를 검사하며, unit/E2E/CI가 있다. 반면 module import 방향, cycle, cross-module ORM relation, HTTP exception 위치, authorization 위치는 자동 검출하지 않는다 (`eslint.config.mjs`, `scripts/check-scaffold.ts`, `.github/workflows/ci.yml`).
5. 유효한 CRUD thin reference는 현재 없다. Thick reference의 가장 가까운 후보는 Health지만, 제품 business invariant가 아니라 운영 readiness orchestration이므로 모든 제품 capability가 복제할 reference로 확정하면 편향될 위험이 있다.

# B. Current Architecture Map

## Bootstrap / composition

- Entry: `src/main.ts` → `src/app.module.ts` → `src/app.setup.ts`.
- 책임: 환경 로딩, global cache/logger/throttle, 선택적 Mongo/metrics/queue 구성, HTTP helmet/CORS/versioning/validation/filter/interceptor, graceful shutdown.
- 중요한 상태: `featureFlags`는 DI 이전 module evaluation에서 결정된다 (`src/app.module.ts:22-30`). `main.ts`가 먼저 `src/config/load-env.ts`를 import해야 한다.
- 테스트: `src/app.setup.spec.ts`, `test/app.e2e-spec.ts`.

## Health

- Entry: `src/health/adapters/in/http/health.controller.ts:16-29`, Prometheus collect 경로는 `src/health/health-metrics.service.ts:92-118`.
- 판단: `HealthCoordinator.check()`가 모든 indicator를 병렬 실행하고, 하나라도 down이면 system down이다 (`src/health/application/health.coordinator.ts:17-30`). indicator 예외는 down snapshot으로 변환한다 (`:44-52`).
- HTTP representation: controller가 down을 `ServiceUnavailableException`/503으로 매핑한다 (`src/health/adapters/in/http/health.controller.ts:21-28`).
- External I/O: RDB ping, Redis ping, Mongo ping, `statfs('/')`, process heap.
- Cross-module: health → `infra/rdb`, `infra/redis`; health metrics → `infra/metrics`를 `ModuleRef`로 선택 조회한다.
- 테스트: coordinator/query/모든 adapter/metrics unit test가 production 파일과 colocated, endpoint는 `test/app.e2e-spec.ts:28-61`.
- 주요 불변식: 필수 indicator 하나라도 unavailable이면 readiness 503; 비활성 Redis도 목록에서 사라지지 않고 down으로 보고된다.

## Metrics / observability

- Entry: `src/infra/metrics/metrics.controller.ts`; raw Prometheus text를 반환한다.
- 판단: `MetricsService`가 registry/prefix/render를 소유하고 `HttpMetricsInterceptor`가 request count, duration, active gauge를 기록한다.
- External I/O: HTTP request/response, Prometheus registry; 생성 스크립트가 `ops/prometheus`와 Grafana JSON을 읽고 쓴다 (`scripts/generate-observability.ts`).
- Cross-module: Health가 global container lookup으로 `MetricsService`를 발견한다 (`src/health/health-metrics.service.ts:54-73`). Queue의 `BullmqMetricsService`는 `MetricsService`를 직접 주입하지만 QueueModule은 MetricsModule을 import하지 않는다 (`src/infra/queue/bullmq-metrics.service.ts:17-23`, `src/infra/queue/queue.module.ts:13-34`).
- 테스트: `src/infra/metrics/*.spec.ts`, E2E raw representation과 health gauge (`test/app.e2e-spec.ts:45-61`).

## Queue / background jobs

- Entry: producer `BackgroundJobsService.enqueue()` (`src/infra/queue/background-jobs.service.ts:9-11`), consumer `BackgroundJobsProcessor.process()` (`src/infra/queue/background-jobs.processor.ts:19-39`).
- Seam: `MessageQueuePort.publish()`과 BullMQ adapter (`src/common/messaging/message-queue.port.ts`, `src/infra/queue/bullmq-message-queue.adapter.ts`).
- Policy: adapter 기본 attempts=3, optional delay/deduplication, completed removal, failed retention (`bullmq-message-queue.adapter.ts:16-25`). Processor는 현재 payload를 로그하고 그대로 반환하는 scaffold placeholder다.
- External I/O: BullMQ/Redis, high-resolution process clock, logging, metrics.
- 테스트: queue 파일별 colocated unit tests. 실제 broker E2E는 없다.

## Redis / cache

- Entry/interface: global `RedisService`가 raw `getClient()`와 key/value/set/expiry operations를 export한다 (`src/infra/redis/redis.service.ts:7-92`). Cache는 별도로 global Nest `CacheModule`로 조립된다 (`src/app.module.ts:54-58`).
- 상태/오류: disabled Redis의 optional ping은 `DISABLED`; required operation은 Nest `ServiceUnavailableException`을 던진다 (`redis.service.ts:100-129`).
- External I/O: ioredis TCP connection; timeout/retry 값은 `src/config/redis.config.ts`에 있다. 범용 idempotency는 없다.
- 테스트: `src/infra/redis/redis.service.spec.ts`; 실제 Redis E2E는 없다.

## RDB persistence foundation

- Composition: `src/infra/rdb/rdb-database.module.ts`가 TypeORM root와 `RDB_HEALTH_PROBE`를 제공한다.
- Seam: generic `IRepository<T>` (`src/common/persistence/repository.port.ts`) → `TypeOrmRepositoryAdapter<T>` (`src/common/persistence/typeorm-repository.adapter.ts`). Entity-bound token/provider는 `src/common/persistence/provide-repository-port.ts`.
- Query surface: equality/IN/IS NULL, projection, ordering, paging, insert/update/delete/count. `undefined` where와 empty update/delete criteria를 계약 위반으로 차단하고 driver unique violations를 `UniqueConstraintError`로 번역한다.
- Production entity/relation: 없음. `src/database/migrations/`도 현재 없음.
- 테스트: adapter unit tests와 실제 selected RDB E2E fixture (`test/persistence.e2e-spec.ts`).

## MongoDB

- `src/infra/mongodb/mongodb.module.ts`가 Mongoose 연결을 export한다. Production schema/model은 없다.
- Health만 connection ready state와 admin ping을 사용한다 (`src/health/adapters/out/mongodb-health.adapter.ts:16-26`).

## Scaffold selection/configuration

- `barebones.config.json`의 ORM/RDB 선택을 `src/config/scaffold.config.ts`, `src/config/typeorm-rdb-generator.ts`, `scripts/select-scaffold.ts`, `scripts/check-scaffold.ts`가 package/module/files/Compose/E2E와 맞춘다.
- 이 capability는 runtime business 기능은 아니지만 파생 프로젝트 생성 정확성에 중요한 상태/일관성 규칙을 가진다.
- 테스트: `src/config/scaffold.config.spec.ts`, `src/config/typeorm-rdb-generator.spec.ts`.

# C. Thin / Thick Classification

| Capability             | 임시 분류                     | 근거                                                                                                                                                                  |
| ---------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Health                 | Thick                         | 여러 entry point, 병렬 orchestration, up/down invariant, 5개 external probe, HTTP 503 mapping (`src/health/`)                                                         |
| Scaffold selection     | Thick                         | ORM/RDB profile이라는 상태, 여러 artifact 간 일관성, generator + validator + Docker/E2E 결합 (`src/config/scaffold.config.ts`, `src/config/typeorm-rdb-generator.ts`) |
| Metrics                | Thin candidate                | 주로 registry/render/HTTP instrumentation이며 제품 상태 전이가 없음. 다만 Health와 Queue의 관측 integration seam 역할도 한다 (`src/infra/metrics/`)                   |
| Queue                  | Unclear                       | port/adapter/retry/dedup seam은 있으나 실제 job business handler가 없고 processor는 payload pass-through (`src/infra/queue/`)                                         |
| Redis                  | Thin infrastructure candidate | driver wrapper와 연결 생명주기 중심. 다만 global/raw client interface가 향후 사용처에 따라 결합을 키울 수 있음 (`src/infra/redis/redis.service.ts`)                   |
| Persistence foundation | Unclear                       | 구현 자체는 깊은 adapter지만 실제 production aggregate/use case가 없어 capability 구조 비용을 판단할 수 없음                                                          |
| MongoDB                | Thin infrastructure candidate | 연결 composition과 health ping뿐이며 schema/use case 없음                                                                                                             |

CRUD 중심의 **제품 capability thin 후보는 없음**이다. 테스트 전용 `ProbeRepository`를 reference로 승격하면 scaffold fixture를 제품 설계로 오인하게 된다.

# D. Business Logic Map

제품 business rule은 없다. 확인된 운영/구성 규칙은 다음과 같다.

- Health 상태 집계·예외 격리: `HealthCoordinator.check/checkIndicator` (`src/health/application/health.coordinator.ts:17-52`).
- Disk threshold 95%: `DiskHealthAdapter.check` (`src/health/adapters/out/disk-health.adapter.ts:33-45`).
- Heap threshold: `MemoryHealthAdapter.check` (`src/health/adapters/out/memory-health.adapter.ts:28-32`).
- Redis availability semantics: `RedisService.getRequiredConnectedClient` (`src/infra/redis/redis.service.ts:112-129`).
- Queue retry/dedup/removal policy: `BullmqMessageQueueAdapter.publish` (`src/infra/queue/bullmq-message-queue.adapter.ts:16-25`).
- Persistence safety/translation: `TypeOrmRepositoryAdapter.toWhere`, `assertNonEmptyWhere`, `rethrowUniqueViolation` (`src/common/persistence/typeorm-repository.adapter.ts`).
- Scaffold consistency: `scaffoldConsistencyIssues`와 Compose/migration helpers (`src/config/scaffold.config.ts:185-477`).
- Transport envelope/error representation: `src/common/interceptors/response.interceptor.ts`, `src/common/filters/all-exceptions.filter.ts`.

Controller, Guard, DTO, subscriber, event handler 안의 제품 규칙은 발견되지 않았다. Queue consumer에는 제품 처리 규칙이 없다.

# E. Persistence / TypeORM Map

- Production `@Entity`, relation decorator: **없음**.
- Test entities: `test/persistence.e2e-spec.ts:32-46`, `src/common/persistence/provide-repository-port.spec.ts:7-10`.
- Cross-module ORM relation/FK: **없음/평가 불가**.
- Direct `Repository<T>` injection: 공용 provider factory/adapter와 tests에만 존재 (`src/common/persistence/provide-repository-port.ts:72-80`).
- Custom repository: TypeORM custom repository는 없음. 테스트의 `ProbeRepository`는 domain-shaped wrapper fixture다.
- QueryBuilder, EntityManager, QueryRunner, raw SQL: QueryBuilder/manager/runner는 없음. `RDB_HEALTH_PROBE` 구현의 `DataSource.query('SELECT 1')`만 raw SQL이다 (`src/infra/rdb/rdb-database.module.ts`).
- Transaction: decorator, `DataSource.transaction`, manager transaction, QueryRunner, CLS 모두 **없음**. Cross-capability write transaction도 없음.
- TypeORM leakage: ESLint가 지정 query types/imports를 `common/persistence`, `config`, `database`, `infra/rdb` 밖에서 금지한다. 그러나 rule 주석이 인정하듯 구조적 타입을 통한 query-shaped object나 entity decorators 자체는 막지 않는다 (`eslint.config.mjs`).

# F. Cross-module Dependency Map

```text
App composition
 ├─→ Health ──DI/import──→ RDB health probe
 │     ├─→ RedisService
 │     ├─→ Mongo connection (feature flag)
 │     └─→ MetricsService (ModuleRef, optional global lookup)
 ├─→ Metrics (feature flag)
 ├─→ RDB
 ├─→ Redis (global)
 ├─→ Mongo (feature flag)
 └─→ Queue (BullMQ + Redis feature flags)

Queue producer → MessageQueuePort ← BullMQ adapter
Queue metrics ──DI──→ MetricsService (MetricsModule is conditional/global)
Persistence caller → IRepository<T> ← TypeORM adapter
```

- TypeScript import와 Nest DI는 위 경로에 함께 존재한다.
- ORM relation/DB FK/event 기반 module communication은 production에 없다.
- Queue는 async communication infrastructure를 제공하지만 다른 capability가 실제 publish/consume하지 않는다.
- `forwardRef()`, 양방향 module imports, 양방향 service injection은 발견되지 않았다.
- 잠재적으로 숨은 결합: HealthMetricsService의 `ModuleRef.get(..., {strict:false})`는 정적 module imports graph에 나타나지 않는 global-container dependency다 (`src/health/health-metrics.service.ts:54-63`).
- 확인 필요 wiring: `PROMETHEUS_ENABLED`와 `BULLMQ_ENABLED`는 독립 플래그인데, Queue의 metrics provider는 conditional global MetricsModule이 없을 때도 `MetricsService`를 필수 주입한다. 기존 E2E는 반대 조합(BullMQ off / Prometheus on)만 설정한다 (`test/load-test-env.ts:16-17`). Queue on / Prometheus off의 boot 성공 여부는 이 세션에서 runtime 확인하지 못했다.

# G. Authorization & Validation Map

## Authorization

- Authentication(JWT/session/API key): 없음.
- Role/scope/permission: 없음.
- Resource ownership/business-state permission: 적용할 resource/use case 자체가 없음.
- `ThrottlerGuard`는 global rate limit이며 authorization이 아니다 (`src/app.module.ts:78-86`). Health는 `@SkipThrottle`이다.
- 따라서 “HTTP Guard에만 있어 다른 entry point가 우회”하는 현행 사례는 없지만, 향후 authorization 책임 위치를 증명하는 reference도 없다.

## Validation

- 환경 구조/범위: Joi `validationSchema` (`src/config/env.validation.ts`)와 `ConfigModule` boot validation.
- HTTP transport: global `ValidationPipe`가 transform/whitelist/forbidNonWhitelisted를 켠다 (`src/app.setup.ts:38-45`). 현재 request DTO가 없어 실제 endpoint input 보호 사례는 없다.
- Business/운영 invariant: health adapters/coordinator, repository adapter contract, scaffold validator에 있다.
- DB constraints: production entity가 없어 없음. Test fixture에 unique/name/select constraints만 있다.

# H. External I/O Map

| External                           | 사용 위치                                             | Adapter/wrapper                              | Retry/timeout/idempotency/transaction                             |
| ---------------------------------- | ----------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------- |
| HTTP                               | health/metrics controllers, global pipeline           | Nest controller/interceptors/filter          | throttle 있음; app-level timeout 없음                             |
| PostgreSQL/selected RDB            | RDB module, persistence adapter                       | TypeORM + `IRepository<T>`                   | pool/config는 DB config; transaction 사용 없음                    |
| MongoDB                            | Mongo module, health adapter                          | Mongoose module; health port adapter         | ping timeout/retry는 별도 정책 없음                               |
| Redis                              | RedisService, cache, BullMQ                           | RedisService 및 library modules              | config에 retry/connect settings; generic idempotency 없음         |
| BullMQ                             | queue module                                          | `MessageQueuePort` + adapter                 | attempts 기본 3, dedup key optional, DLQ 명시 없음                |
| Filesystem                         | disk health `statfs`, scaffold/observability scripts  | disk probe seam; scripts는 Node fs 직접 사용 | 없음                                                              |
| Clock/time                         | queue duration, metrics, date util                    | 대부분 process/global 직접 사용              | deterministic clock port 없음                                     |
| Random UUID                        | request/correlation id (`src/config/pino.config.ts`)  | Node crypto 직접 사용                        | 해당 없음                                                         |
| Loki                               | optional pino transport (`src/config/pino.config.ts`) | pino-loki                                    | batching interval 설정; repository-level timeout/retry 확인 안 됨 |
| SMTP/payment/S3/Kafka/RabbitMQ/SQS | 없음                                                  | 해당 없음                                    | 해당 없음                                                         |

HTTP envelope와 error body는 application이 아니라 global interceptor/filter에 있다. 예외는 RedisService가 Nest `ServiceUnavailableException`을 직접 던져 infrastructure wrapper가 HTTP framework 의미를 안다는 한 사례가 있다 (`src/infra/redis/redis.service.ts:112-126`).

# I. Change Surface Findings

Git 이력은 task metadata가 완전한 commit만 보조 근거로 사용했다.

1. **Queue composition seam 이동 — `2490e0b` (2026-08-31).** 목적은 BullMQ root가 AppModule/QueueModule 두 곳에 갈라진 상태 제거. Code coupled edit set은 `src/app.module.ts` + `src/infra/queue/queue.module.ts`; 문서 `CLAUDE.md`가 동반됐다. 이전 discovery path는 app composition과 queue 내부를 모두 알아야 했고, 변경 후 broker composition locality가 QueueModule로 모였다.
2. **Scaffold/Compose 구조 검증 — `53c072e` (2026-08-31).** 15 files. 실제 coupled set은 generator, scaffold validator, 두 Compose 구성, test env/persistence E2E, 관련 specs와 package script다. 선택 하나가 JSON/package/module/file/Compose/test datasource에 반복 표현되므로 partial update 위험이 실재한다. 이 ceremony는 여러 배포 산출물의 일치를 보장하는 비용이며 `check:scaffold`가 일부를 자동화한다.
3. **Health adapter library 교체 — `d5571e1` (2026-08-28).** 7 files. disk/memory adapters, 두 colocated specs, HealthModule, package/lockfile가 함께 변경됐다. capability 내부 파일과 dependency manifest로 국한돼 locality가 비교적 높다.
4. **Hexagonal persistence foundation — `3862683` (2026-08-14).** 52 files. 이는 단일 business rule 변경이 아니라 persistence profile, health, Mongo, config, docs를 함께 도입한 architecture rollout이므로 files-per-task metric으로 쓰면 왜곡된다. 다만 현재 foundation이 아직 production aggregate로 검증되지 않았다는 근거다.
5. **조용한 관측/응답 실패 묶음 — `a9902c2` (2026-08-04).** 18 files에 logging, Redis, BullMQ config, health, exception filter, dashboards가 섞였다. commit 자체가 여러 독립 bug를 한 번에 묶었으므로 하나의 coupled edit set으로 간주할 수 없다. 개별 사례는 config 상수와 실행 경로가 drift할 때 tests/observability artifact까지 함께 확인해야 함을 보여준다.

정량적 discovery cost는 task trace 데이터가 없어 꾸며내지 않았다. 현재 파일명 기준 시작점은 health/queue/redis는 비교적 직접적이고, scaffold profile 변경은 `barebones.config.json`에서 시작해 scripts/config/templates/Compose/E2E로 확장된다.

# J. Current Enforcement

## Command failure로 잡히는 것

- TypeScript strict/NodeNext/ESM type errors: `pnpm typecheck`, `pnpm build`.
- TypeORM query import 위치, object spread, unsafe async/import/style 일부: `pnpm lint`와 `eslint.config.mjs`.
- ORM/RDB 선택과 package/files/module/Compose/E2E/migration output 일치: `pnpm check:scaffold`.
- Prometheus/Grafana 생성물 drift: `pnpm check:observability`.
- unit behavior: `pnpm test`; HTTP/real selected RDB behavior: `pnpm test:e2e`.
- CI는 GitHub Actions와 Bitbucket 모두 scaffold/observability/lint/typecheck/unit/E2E/build를 수행한다. GitHub만 Compose warning 검사도 한다 (`.github/workflows/ci.yml`, `bitbucket-pipelines.yml`).

## 자연어/리뷰에 의존하거나 빠져나갈 수 있는 것

- feature-first module 방향, application/domain의 Nest import 금지, module public interface, cycles/`forwardRef`, cross-module imports/DI/ORM relations.
- TypeORM entity decorator와 DB FK의 module 소유권.
- `HttpException`이 controller 밖으로 새는 것, resource authorization/validation 위치.
- generic repository criteria가 service public interface로 노출되는 것. ESLint rule도 구조적 타입 우회를 명시한다.
- 실제 Redis/BullMQ/Mongo failure semantics; CI E2E는 RDB/HTTP 중심이다.
- Queue on / Prometheus off feature-flag 조합의 DI wiring. 현재 flag validation은 두 값을 독립적으로 허용하고 조합 E2E가 없다.

## 이번 분석의 실행 확인

현재 shell에서 모든 pnpm 검증은 실행 전에 동일하게 차단됐다: manifest는 pnpm `>=11.22.0`을 요구하지만 사용 가능한 pnpm은 `11.19.0`; `node`와 `corepack`은 PATH에 없다. 따라서 이 보고서 세션에서 test/build 성공을 주장하지 않는다. 작업 시작/종료 시 Git working tree의 production code 변경은 없었다.

# K. Problems

- **Discoverability:** scaffold 선택 변경은 config/generator/templates/Compose/tests에 퍼진다 (`scripts/check-scaffold.ts`, `src/config/scaffold.config.ts`, `src/config/typeorm-rdb-generator.ts`). 자동 검증은 있으나 시작점 이후 읽을 surface가 넓다.
- **Coupled change surface:** ORM/RDB profile은 여러 artifact에 같은 선택을 표현한다. `53c072e`가 leftover DB/service와 wrong E2E port가 기존 check를 통과했음을 기록한다.
- **Cross-module coupling:** HealthMetricsService가 `ModuleRef` global lookup으로 Metrics에 숨은 runtime dependency를 가진다 (`src/health/health-metrics.service.ts:37-69`). Queue는 반대로 conditional global MetricsModule의 provider를 필수 주입한다 (`src/infra/queue/bullmq-metrics.service.ts:17-23`). 정적 module import만으로 두 runtime dependency를 완전히 설명하기 어렵다.
- **Framework leakage:** RedisService가 Nest `ServiceUnavailableException`을 직접 생성한다 (`src/infra/redis/redis.service.ts:112-126`). 재사용 entry point가 HTTP가 아닐 때도 HTTP 의미가 interface의 일부가 된다.
- **Persistence coupling:** production 증거는 아직 없지만 `IRepository<T>`가 `Partial<T>`/generic criteria를 제공해 entity shape와 persistence interface가 결합될 가능성이 있다 (`src/common/persistence/repository.port.ts:158-181`). 실제 domain repository가 이를 감추는지는 test fixture만 보여준다.
- **Authorization leakage:** 현재 auth가 전혀 없어 누출 사례도, 올바른 seam의 reference도 없다. Phase 1.5에서 정책을 코드 현실로 “확인”할 수 없고 신규 capability 기준으로 결정해야 한다.
- **Validation ambiguity:** global ValidationPipe는 존재하지만 DTO 사례가 없고, Redis availability는 service의 HTTP exception, health 상태는 adapter/coordinator에 있다. transport/business 분리의 제품 예시는 없다.
- **Unnecessary abstraction:** `GetHealthQueryHandler.execute()`는 현재 `HealthCoordinator.check()`를 그대로 전달한다 (`src/health/application/queries/get-health.query-handler.ts:7-14`). CQRS entry 통일을 위한 비용인지, shallow pass-through인지는 두 번째 query/use case가 생길 때 재평가해야 한다.
- **Missing abstraction:** RedisService가 global이며 `getClient(): Redis | null`을 공개해 caller가 ioredis interface에 직접 결합할 수 있다 (`src/infra/redis/redis.service.ts:17-19`). 실제 누출 caller는 아직 없다.
- **Insufficient validation:** 실제 broker/Redis/Mongo E2E와 module dependency architecture check가 없다. Queue processor는 real business handler, retry exhaustion, DLQ behavior를 검증하지 않으며 Queue on / Prometheus off boot 조합도 보호되지 않는다.

# L. Reference Candidates

## Thin reference candidate

**선정 보류 — 유효한 CRUD production capability 없음.**

- Metrics/Redis는 thin infrastructure module의 예시는 될 수 있지만 CRUD capability reference가 아니다.
- `ProbeRepository`는 실제 DB adapter 검증용 test fixture이며 `test/persistence.e2e-spec.ts:29-30`이 production domain을 만들지 않는다고 명시한다.
- 이를 복제하면 generic persistence ceremony를 제품 thin module의 기본값으로 잘못 고정할 위험이 있다.

## Thick reference candidate

**조건부 후보: Health (`src/health/`).**

- 적합: 여러 entry point, coordinator, explicit outbound port, 다수 adapter, 실패 격리, 상태 집계, colocated tests가 실제로 있다.
- 부적합 가능성: 제품 state transition/authorization/transaction/persistence model이 없다. CQRS query와 adapter layering을 단순 CRUD에 복제하면 shallow ceremony가 된다.
- 현재 테스트: coordinator/query/adapters/metrics unit + HTTP/Prometheus E2E가 핵심 behavior를 상당 부분 보호한다.
- migration 위험: optional Metrics lookup, feature-flagged Mongo, always-present Redis semantics를 바꾸면 readiness/alerts가 조용히 달라질 수 있다.
- 모방 영향: external dependency orchestration에는 유용하지만 persistence-heavy aggregate의 reference로는 불충분하다.

# M. Characterization Test Readiness

- Thin reference: 후보가 없으므로 **Phase 3 전 신규 thin capability 선정 후 characterization test 필요 여부 재평가**.
- Health thick candidate: 503/200 body, indicator aggregation, adapter failure, Prometheus 0/1은 보호된다. 다만 all-up HTTP 200을 실제 AppModule E2E로 고정하는 test와 dependency timeout/hang behavior는 확인되지 않았다. migration 전 timeout/partial failure expectation을 결정하고 보강할 필요가 있다.
- Queue alternative thick 후보: 실제 broker E2E/job semantics와 metrics-disabled boot 검증이 없어 reference migration 전에 characterization이 필수다.

# N. Phase 1.5 Decision Package

## Decision A — Persistence / Domain Model

- 현재: production entity가 없고 generic TypeORM adapter + fixture만 있다.
- 선택지: capability별 shared entity/domain model; state/invariant가 무거운 capability만 분리; 전역 분리.
- 장점/비용: shared는 thin CRUD locality와 적은 mapper를 얻지만 persistence change가 model에 닿는다. selective split은 실제 필요에 맞지만 module마다 판단 기준이 필요하다. global split은 isolation 대신 mapper/drift ceremony를 모든 capability에 부과한다.
- 영향: 지금은 foundation/test 외 변경 대상이 없다.
- 권고안: **capability별 선택**, 첫 production thin/thick 사례에서 coupled edit set을 측정. 전역 분리는 보류.
- 근거: 현 저장소에는 model divergence를 증명할 aggregate가 없다.

## Decision B — Cross-module ORM Relation / FK

- 현재: production relation/FK 없음.
- 선택지: relation decorator+FK 허용; FK만 허용하고 ORM navigation 금지; 둘 다 module-local ID로 제한.
- 장점/비용: relation은 query 편의와 referential integrity를 함께 주지만 object graph/import coupling이 생긴다. FK-only는 DB integrity를 보존하면서 ORM navigation coupling을 줄이나 query/loader 비용이 생긴다. 모두 금지는 독립성 대신 integrity/orphan 처리 비용이 생긴다.
- 영향: 현재 즉시 영향 없음.
- 권고안: **decorator와 DB FK를 별도 결정**, 기본 검토점은 FK 유지 + cross-module navigation 명시 승인. 확정은 실제 relation use case까지 보류.
- 근거: 현 코드에는 반증/검증 사례가 없다.

## Decision C — Cross-module Query

- 현재: health가 각 owner adapter를 호출할 뿐 business join이 없다.
- 선택지: strict ownership; write strict/read relaxed; controlled cross-module join.
- 장점/비용: strict는 ownership이 선명하지만 reporting round-trip이 늘 수 있다. read relaxed는 locality/성능을 얻지만 schema coupling이 생긴다. controlled join은 명시적 seam이 필요하다.
- 영향: 현재 query code 변경 없음.
- 권고안: writes는 owner 경유를 기본으로 두고, read는 실제 reporting/query가 생길 때 latency와 change ownership으로 선택.
- 근거: 현재 join workload가 없어 하나를 강제하면 가설뿐이다.

## Decision D — Authorization

- 현재: authentication/role/resource permission 모두 없음; throttle만 있다.
- 선택지: auth/coarse policy는 transport guard, resource/business permission은 application; 모든 authorization guard; domain policy object 포함 selective split.
- 장점/비용: guard-only는 HTTP locality가 좋지만 CLI/queue 우회 위험이 있다. application은 entry 재사용을 보호하지만 caller identity interface가 필요하다. domain policy는 복잡 invariant에 유용하지만 thin capability에는 ceremony다.
- 영향: 신규 auth capability의 interface를 결정하며 기존 code에는 즉시 적용할 규칙이 없다.
- 권고안: identity parsing/coarse scope와 resource/business permission을 분리하되, 첫 실제 use case에서 identity 전달 seam을 확정.
- 근거: 현재 우회 사례가 아니라 부재 상태다.

## Decision E — Validation

- 현재: Joi env + global ValidationPipe, operational invariant는 coordinator/adapter/repository validator에 분산.
- 선택지: transport DTO/pipe + application/domain invariant; controller/service 혼합; entity/database 중심.
- 장점/비용: 분리는 multi-entry 재사용을 보호하나 simple CRUD에 중복 검증을 만들 수 있다. transport 중심은 단순하지만 queue/CLI 우회 가능. DB 중심은 concurrency integrity가 강하지만 오류 의미 번역이 필요하다.
- 영향: 현재 request DTO가 없어 immediate migration 없음.
- 권고안: shape/format은 transport, 상태/ownership은 reusable application/domain module, uniqueness/referential integrity는 DB로 역할을 나누되 thin capability는 중복 model을 만들지 않는다.
- 근거: repository unique translation이 DB constraint와 application error 의미의 분리 필요를 이미 보여준다.

## Decision F — Module Communication

- 현재: health는 synchronous port fan-out; health→metrics는 optional ModuleRef; queue port는 async infrastructure이나 실제 inter-capability event 없음; shared transaction 없음.
- 선택지: synchronous facade, event, shared transaction.
- 장점/비용: sync는 결과/실패가 즉시 필요할 때 단순하다. event는 temporal decoupling/retry를 주지만 eventual consistency/idempotency가 필요하다. shared transaction은 atomicity를 주지만 ownership/schema coupling이 가장 크다.
- 영향: Queue port의 retry/dedup policy와 future handler ownership에 직접 영향.
- 권고안: 즉시 판단/결과는 named synchronous interface, 독립 후속작업은 event, 하나의 invariant를 원자적으로 지켜야 하는 경우만 shared transaction 검토.
- 근거: Health의 synchronous aggregation과 아직 비어 있는 queue consumer가 두 모델의 실제 현재 한계를 보여준다.

# O. Proposed Migration Sequence

1. Phase 1.5에서 A–F를 전역 규칙이 아니라 default + exception gate 형태로 결정한다.
2. dependency rule 도입 전, 현재 허용/금지 import 사례를 fixture로 고정하고 CI 명령의 pnpm/Node 재현성을 확인한다.
3. 첫 실제 CRUD production capability를 thin reference로 선정하고 최소 transport/application/persistence 경로와 characterization test를 만든다.
4. Health를 operational thick reference로 정리하되, 제품 thick reference는 상태 전이/authorization/transaction이 실제 생긴 capability에서 별도로 선정한다.
5. representative tasks로 discovery path와 coupled edit set을 측정한다: thin field 추가, thick invariant 변경, schema migration, external adapter 교체.
6. 측정에서 반복된 위반만 ESLint/dependency tool/TypeScript/tests/CI로 내린다.
7. module-by-module migration은 제품 capability가 생긴 뒤 수행하고, 공용 scaffold infrastructure를 일괄적으로 domain/ports/adapters에 재배치하지 않는다.

PHASE 1 COMPLETE
Production code changes: NONE
Ready for human architecture decisions: YES
