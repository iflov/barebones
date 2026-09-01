# Barebones NestJS Scaffold

도메인과 인증을 포함하지 않는 NestJS 12 백엔드 시작점입니다. 파생 프로젝트가 필요한 도메인만
추가할 수 있도록 헥사고날 경계, CQRS-lite, 로컬 Docker 인프라와 운영 기본값을 제공합니다.

## 포함 범위

- HTTP inbound adapter → CQRS command/query handler → application port → outbound adapter
- 생성 시 한 번 선택하는 RDB/ORM 조합
  - RDB: PostgreSQL, MySQL, MariaDB
  - ORM: TypeORM(기본), Prisma, MikroORM, Drizzle 프로필
- MongoDB 선택 사용, Redis cache, BullMQ 기본 message queue adapter
- 교체 가능한 `MessageQueuePort`
- health coordinator: HTTP, CLI, Prometheus가 같은 판정 재사용
- Swagger, 구조화 로그, Prometheus/Grafana/Loki
- AWS Terraform 시작 구성
- Claude용 `.claude/skills`, Codex용 `.agents/skills`에 각각 설치된 Matt Pocock skills

인증·인가·사용자·관리자 모듈은 의도적으로 없습니다.

## ESM과 TypeORM migration

애플리케이션과 빌드 산출물은 native ESM입니다. TypeScript의 상대 import에는 출력 파일 기준
`.js` 확장자를 씁니다. 저장소의 TypeScript 운영 스크립트는 `tsx`, TypeORM CLI는
`typeorm-ts-node-esm`으로 실행합니다.

```bash
pnpm migration:generate
pnpm exec eslint --fix src/database/migrations
pnpm migration:run
pnpm migration:revert
```

TypeORM 생성 직후의 migration은 type-only 심볼을 일반 import로 출력할 수 있으므로 앱이나 CLI를
다시 실행하기 전에 lint fix를 적용합니다. pre-commit도 같은 수정을 하지만 생성 직후 실행 경로는
보호하지 못합니다. migration glob은 설정 모듈 위치를 기준으로 `src`와 `dist`를 스스로 찾고,
`pnpm build`는 source migration과 build artifact가 일치하지 않으면 실패합니다.

## 시작하기

```bash
cp .env.example .env
docker compose up -d --build
docker compose logs -f app
```

- Swagger: `http://localhost:3000/docs`
- readiness: `http://localhost:3000/v1/system/health`
- metrics: `http://localhost:3000/v1/system/metrics`

## 스캐폴드 선택

현재 materialized 선택은 [barebones.config.json](./barebones.config.json)에 기록됩니다.
선택값과 패키지, DB 드라이버, 활성 RDB 모듈, `.env.example`, Docker Compose 또는 TypeORM
migration 산출물이 다르면 빌드가 즉시 실패합니다.

```bash
pnpm check:scaffold
```

ORM이나 DB는 배포 환경변수로 바꾸지 않습니다. 생성기가 조합을 만들고 검증기가 drift를 막습니다.

```bash
# 먼저 변경 계획만 확인
pnpm scaffold:select --orm=prisma --database=postgres

# 파일·패키지·Compose를 실제로 교체하고 검증
pnpm scaffold:select --orm=drizzle --database=mariadb --apply
```

허용값은 ORM `typeorm | prisma | mikroorm | drizzle`, RDB
`postgres | mysql | mariadb`입니다. `--apply`는 의존성 설치 후 scaffold 검사, lint, typecheck까지
실행합니다.

## 아키텍처

전체 규칙과 새 capability 작성 기준은 [ARCHITECTURE.md](./ARCHITECTURE.md)가 단일 진실 원천입니다.

```text
HTTP / CLI
  → Controller / Command
  → CommandHandler | QueryHandler
  → Application service or coordinator
  → Port
  → TypeORM | Prisma | MikroORM | Drizzle | MongoDB | Redis | BullMQ/SQS/...
```

CQRS-lite 규칙:

- create/update/delete는 CommandHandler와 쓰기 포트를 사용합니다.
- read는 QueryHandler를 사용하고 외부 I/O가 있으면 이름 있는 QueryPort를 사용합니다.
- 외부 I/O port는 구현체가 하나여도 사용하는 capability가 소유합니다.
- Handler가 use case이므로 전달만 하는 별도 UseCase 계층을 겹치지 않습니다.
- ORM model은 outbound adapter가 소유하며 별도 Mapper 클래스는 mapping이 복잡해질 때만 만듭니다.
- 단순 기능에 별도 read model이나 event sourcing을 강제하지 않습니다.
- 한 aggregate의 authoritative store는 하나입니다. RDB와 MongoDB 동시 쓰기는 기본값이 아닙니다.

## Health 의미

- 선택·활성화된 필수 의존성이 모두 정상이면 `200`
- 활성화된 의존성의 실행 중 장애는 `503`
- 최초 연결이 실패하면 제한된 재시도 후 애플리케이션 부팅 자체가 실패할 수 있습니다.
- 비활성화된 선택 기능은 검사 목록에 넣지 않습니다.

## 프로젝트 스킬

Matt Pocock의 안정 `engineering`/`productivity` 스킬을 두 에이전트에 독립 복사합니다.

- Claude: `.claude/skills/`
- Codex: `.agents/skills/`

두 디렉터리는 symlink로 공유하지 않습니다. 각 에이전트가 해당 디렉터리만 읽습니다. 스킬은
사용자가 이름을 명시했을 때만 실행합니다.

## 배포

이 저장소의 범위는 **컨테이너 경계까지**입니다 — `Dockerfile`과 Compose가 "이 서비스를
어떻게 돌리나"를 정의하고, `.env.example`과 `src/config/env.validation.ts`가 "앱이 무슨
설정을 요구하나"를 정의합니다. 둘 다 클라우드에 무관합니다.

AWS 인프라는 [iflov/barebones-infra](https://github.com/iflov/barebones-infra)에 있습니다.
2026-09-01에 분리했습니다 — VPC·ALB·ECS 클러스터는 환경당 정확히 하나뿐인 **인스턴스**라
스캐폴드가 실을 수 없고, 그 소비자에는 이 스캐폴드에서 나오지 않은 저장소도 포함됩니다.
근거와 검증 과정은 [결정 문서](./docs/terraform-repo-boundary.md)에 있습니다.

## 검증

```bash
pnpm check:scaffold
pnpm check:observability
pnpm lint
pnpm typecheck
pnpm test
docker compose -f docker-compose.test.yml up -d --wait
pnpm test:e2e
docker compose -f docker-compose.test.yml down
pnpm build
docker compose config --quiet
docker compose -f docker-compose.test.yml config --quiet
```

실제 E2E는 sql.js 같은 인메모리 대체물이 아니라 선택된 Docker RDB를 사용합니다. 테스트 전용
Compose project와 tmpfs가 개발 데이터 및 로컬 개발 Compose lifecycle을 격리하며 기본 호스트 포트는
15432입니다.
