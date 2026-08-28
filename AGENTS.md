# Barebones agent contract

이 저장소는 제품 도메인과 인증을 포함하지 않는 NestJS 백엔드 스캐폴드다. 모든 변경은 파생
프로젝트가 필요한 기술을 선택하고 불필요한 기술을 제거하기 쉽게 만들어야 한다.

## 기본 아키텍처

```text
adapters/in
  → application/commands | application/queries
  → application service/coordinator
  → application port
  → adapters/out
  → external system
```

- 의존성은 바깥 adapter에서 application/domain 방향으로 향한다.
- application/domain은 Nest transport, ORM, DB driver, Redis, BullMQ 타입을 import하지 않는다.
- Controller는 HTTP 입력·출력·상태 코드만 책임진다.
- CLI와 HTTP가 같은 판단을 사용하면 Controller가 아니라 application coordinator를 재사용한다.
- health Controller는 coordinator 결과 `up/down`을 각각 `200/503`으로 매핑한다.

## CQRS-lite

- create/update/delete는 Command와 CommandHandler를 사용한다.
- read는 Query와 QueryHandler를 사용한다.
- 이름 있는 write/query port를 우선하고 범용 CRUD 계약을 도메인 밖으로 노출하지 않는다.
- 별도 read database, event sourcing, eventual consistency는 요구사항이 있을 때만 도입한다.

## Persistence

- ORM과 RDB는 프로젝트 생성 시 한 번 선택한다.
- 지원 ORM: TypeORM, Prisma, MikroORM, Drizzle.
- 지원 RDB: PostgreSQL, MySQL, MariaDB.
- `barebones.config.json`과 실제 패키지·모듈·Compose가 일치해야 한다.
- 배포 환경변수만으로 ORM이나 RDB 종류를 바꾸지 않는다.
- RDB와 MongoDB를 함께 쓸 수 있지만 한 aggregate의 authoritative store는 하나다.
- 두 저장소 동시 쓰기가 필요하면 dual-write 대신 outbox/event 기반 동기화를 먼저 검토한다.
- TypeORM entity는 소유 feature module의 `forFeature()`로 등록하고 CLI는 `*.entity.ts`를 찾는다.
- migration glob은 `import.meta.url` 기준이어야 한다. CWD 기준 `src/...` 경로를 다시 넣지 않는다.
- migration 생성 직후에는 실행 전에 lint fix로 type-only import를 고친다. `pnpm build`는 source와
  `dist` migration 목록의 일치를 검사한다.

## ESM

- package와 build output은 native ESM이다. TypeScript 상대 import에는 `.js` 확장자를 쓴다.
- 저장소 TypeScript 스크립트는 `tsx`, TypeORM CLI는 `typeorm-ts-node-esm`으로 실행한다.
- CommonJS resolver hook이나 `NODE_OPTIONS --require` 우회를 다시 추가하지 않는다.

## Redis and messaging

- Redis는 cache, distributed coordination, BullMQ 기본 backend로 사용할 수 있다.
- 애플리케이션은 `MessageQueuePort`에 의존한다.
- BullMQ는 기본 outbound/inbound adapter일 뿐이며 SQS, RabbitMQ, Kafka 등으로 교체 가능해야 한다.
- broker별 delivery semantics를 숨기지 않는다. deduplication, retry, DLQ 정책은 adapter 구성에 둔다.

## Infrastructure

- 로컬 의존성은 Docker Compose에서 실행한다. sql.js 같은 인메모리 RDB 대체물을 사용하지 않는다.
- AWS Terraform은 기본 배포 시작점이며 state backend와 secret 값은 환경별로 분리한다.
- app 시작 순서에는 Docker healthcheck를 사용한다.
- 선택된 필수 의존성이 실행 중 실패하면 readiness는 `503`이다.

## Agent tools

- Claude 전용 프로젝트 스킬: `.claude/skills/`
- Codex 전용 프로젝트 스킬: `.agents/skills/`
- 두 디렉터리를 symlink로 공유하지 않는다.
- Matt Pocock 스킬은 사용자가 스킬 이름을 명시했을 때만 실행한다.
- OMC, OMX, GitHub Spec Kit 설정을 다시 추가하지 않는다.

## Required validation

변경 범위에 맞는 검증을 수행하고 통과 근거 없이 완료를 선언하지 않는다.

```bash
pnpm check:scaffold
pnpm check:observability
pnpm lint
pnpm typecheck
pnpm test
DB_PORT=15432 pnpm test:e2e
pnpm build
docker compose config --quiet
```

ORM/RDB 프로필을 바꾸면 선택한 조합의 실제 Docker E2E도 실행한다.
