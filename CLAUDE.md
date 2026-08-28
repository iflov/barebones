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
DB_PORT=15432 pnpm test:e2e
pnpm build
```

## 경계

```text
adapter/in → application command/query → application port → adapter/out
```

- Controller는 HTTP 상태와 DTO 변환만 담당한다.
- CommandHandler는 상태 변경 사용 사례를 실행한다.
- QueryHandler는 조회 사용 사례를 실행한다.
- HTTP, CLI, metrics가 같은 판단을 해야 하면 application coordinator를 공유한다.
- application/domain에서 TypeORM, Prisma, Mongoose, Redis, BullMQ 타입을 import하지 않는다.
- RDB와 MongoDB를 함께 쓸 수 있지만 한 aggregate의 authoritative store는 하나다.
- 메시지 발행은 `MessageQueuePort`를 사용하고 BullMQ 타입을 호출부로 노출하지 않는다.

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

## CQRS-lite

- create/update/delete: Command + CommandHandler + 이름 있는 write port
- read: Query + QueryHandler + 이름 있는 query port
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
