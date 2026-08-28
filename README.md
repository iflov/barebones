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
선택값과 패키지, DB 드라이버, 활성 RDB 모듈, `.env.example`, Docker Compose가 다르면 빌드가
즉시 실패합니다.

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
- 복잡한 조회는 이름 있는 QueryPort를 사용합니다.
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

## AWS Terraform

`infra/terraform`은 ECS Fargate, ALB, RDS(PostgreSQL/MySQL/MariaDB), 선택형 ElastiCache Valkey,
SQS/DLQ의 시작 구성입니다. MongoDB는 DocumentDB로 가정하지 않고 외부 관리형 Mongo URI를 Secrets
Manager로 주입할 수 있게 둡니다.

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
terraform init -backend-config=backend.hcl
terraform plan
```

실제 backend와 secret 값은 커밋하지 않습니다. 처음에는 `backend.hcl.example`을 환경별 파일로
복사하고, state bucket/versioning/lock 설정을 먼저 준비합니다.

## 검증

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

실제 E2E는 sql.js 같은 인메모리 대체물이 아니라 Docker RDB를 사용합니다.
