# Barebones NestJS Migration Scaffold

옵시디언의 `h2biz/지식베이스/아키텍처/NestJS 마이그레이션-*` 문서와 추가 기술스택 요약을 기준으로
Phase 1 인프라 세팅 + 첫 도메인 모듈 시작점을 만든 프로젝트입니다.

## 반영한 문서 기준

- 기술 스택: Node.js 24 LTS, NestJS, TypeORM, Joi, Swagger, Jest
- 아키텍처: Controller → Service → Repository 계층 구조를 위한 도메인 모듈 기반 구조
- API 설계: 전역 응답 래핑 `{ code, message, data }`
- 인증/보안: Helmet, Rate Limiting, Auth 모듈 자리 확보
- 실행 계획: 프로젝트 기반 구축, 글로벌 설정, Docker Compose 개발 환경
- 테스트/코드 품질: ESLint Flat Config, Prettier, Unit/E2E 테스트

## 현재 포함된 것

- NestJS 11 기반 앱 부트스트랩
- `@nestjs/config` + Joi 환경변수 검증
- `dayjs` 기반 날짜 포맷 유틸
- `nestjs-pino` 기반 구조화 로그 + `pino-loki`
- TypeORM 설정
  - 기본 타겟: MariaDB
  - 테스트: `sqljs`
- Redis 서비스 / CacheModule / BullMQ 설정
- Prometheus metrics 엔드포인트 + Grafana datasource provisioning
- Health Check 모듈 (DB + Redis + Memory + Disk)
- 전역 Validation Pipe / Exception Filter / Response Interceptor
- Swagger 문서
- 첫 도메인 모듈 시작점: `user`
- 개발용 Docker Compose (App, MariaDB, Redis, Loki, Prometheus, Grafana)
- Jest Unit / E2E 테스트
- Husky + lint-staged + commitlint 기본 세팅

## 시작하기

```bash
yarn install
cp .env.example .env
yarn start:dev
```

Swagger:

- `http://localhost:3000/admin/docs`

Health:

- `http://localhost:3000/v1/admin/health`

Metrics:

- `http://localhost:3000/v1/admin/metrics`

Users:

- `GET http://localhost:3000/v1/admin/users`
- `POST http://localhost:3000/v1/admin/users`

## Docker 기반 개발 환경

```bash
docker compose up -d
```

### `.env`와 Docker Compose

- `yarn start:dev`는 `.env`의 로컬 값(`DB_HOST=localhost` 등)을 사용합니다.
- `docker compose up -d`는 같은 `.env`를 읽되, 컨테이너 내부 통신이 필요한 항목은
  `DOCKER_DB_HOST`, `DOCKER_REDIS_HOST`, `DOCKER_LOKI_HOST` 값을 사용합니다.
- 즉, 앱 공통 설정은 `.env` 하나로 관리하면서도, 로컬 실행과 Docker 실행의 호스트 차이를 분리했습니다.

### `.env` 작성 규칙

`.env.example`은 아래 섹션으로 나뉘어 있습니다.

- `Application`
- `Logging`
- `HTTP / Health`
- `Redis / Cache / BullMQ`
- `Prometheus`
- `Database`
- `Grafana`

로컬 실행과 Docker 실행에서 특히 아래 3쌍을 구분해야 합니다.

| 목적       | 로컬 실행 값                      | Docker 실행 값                      |
| ---------- | --------------------------------- | ----------------------------------- |
| DB host    | `DB_HOST=localhost`               | `DOCKER_DB_HOST=mariadb`            |
| Redis host | `REDIS_HOST=localhost`            | `DOCKER_REDIS_HOST=redis`           |
| Loki host  | `LOKI_HOST=http://localhost:3100` | `DOCKER_LOKI_HOST=http://loki:3100` |

### 자주 틀리는 항목

- `APP_PORT`
  - 앱 내부 포트입니다.
  - 외부 접속 포트는 `APP_HOST_PORT`입니다.
- `PROMETHEUS_PATH`
  - 현재 스캐폴드는 앱 라우트와 Prometheus scrape 설정이 `/v1/admin/metrics` 기준으로 맞춰져 있습니다.
  - `PROMETHEUS_PATH` 값을 바꾸더라도 런타임 엔드포인트가 자동으로 바뀌지는 않습니다.
  - 경로를 바꾸려면 앱 라우트/Prometheus 설정/문서를 함께 맞춰야 합니다.
- `PROMETHEUS_ENABLED`
  - 현재 문서/환경변수에는 존재하지만, 이 값만으로 metrics 엔드포인트 노출이 꺼지지는 않습니다.
  - 기능 on/off 제어가 필요하면 코드와 운영 설정을 함께 정리해야 합니다.
- `DB_HOST`, `REDIS_HOST`, `LOKI_HOST`
  - 로컬 `yarn start:dev`에서는 `localhost`
  - Docker 내부에서는 각각 `mariadb`, `redis`, `loki`

### 권장 개발용 예시

```env
NODE_ENV=development
APP_NAME=admin
APP_PORT=3000
APP_HOST_PORT=3000

LOG_LEVEL=debug
LOG_LOKI_ENABLED=true
LOG_STDOUT_ENABLED=true
LOKI_HOST=http://localhost:3100
DOCKER_LOKI_HOST=http://loki:3100

REDIS_HOST=localhost
DOCKER_REDIS_HOST=redis
REDIS_PORT=6379
REDIS_DB=0
REDIS_KEY_PREFIX=admin:

DB_HOST=localhost
DOCKER_DB_HOST=mariadb
DB_PORT=3306
DB_USERNAME=admin
DB_PASSWORD=admin
DB_DATABASE=admin

PROMETHEUS_PATH=admin/metrics
```

Grafana:

- `http://localhost:${GRAFANA_HOST_PORT:-3001}`
- id: `.env`의 `GRAFANA_ADMIN_USER`
- pw: `.env`의 `GRAFANA_ADMIN_PASSWORD`

Prometheus:

- `http://localhost:${PROMETHEUS_HOST_PORT:-9090}`

### Prometheus 확인 순서

Prometheus 메인 Query 화면은 처음 열면 자동으로 metric 목록을 보여주지 않습니다.
아무 쿼리도 실행하지 않은 상태에서는 `No data queried yet`가 보일 수 있는데, 이건 **정상 초기 상태**입니다.

먼저 아래 순서로 확인하세요.

1. `http://localhost:${PROMETHEUS_HOST_PORT:-9090}/targets`
2. `app`, `prometheus` target이 둘 다 `UP`인지 확인
3. `http://localhost:${PROMETHEUS_HOST_PORT:-9090}/query`로 이동
4. 아래 starter query 중 하나를 실행

### Starter Query

항상 먼저 확인하기 좋은 metric:

```promql
admin_app_up
admin_process_resident_memory_bytes
admin_health_check_status
```

HTTP 요청을 한 번 발생시킨 뒤 확인할 metric:

```promql
admin_http_request_duration_seconds_count
```

예를 들어 아래 엔드포인트를 먼저 호출한 뒤 다시 쿼리하면 됩니다.

- `http://localhost:${APP_HOST_PORT:-3000}/v1/admin/health`
- `http://localhost:${APP_HOST_PORT:-3000}/v1/admin/users`

BullMQ/Redis 기능이 활성화된 경우 확인할 수 있는 metric:

```promql
admin_bullmq_queue_waiting
admin_bullmq_queue_active
```

### Grafana에서 같이 보면 좋은 대시보드

Prometheus metric을 더 보기 쉽게 확인하려면 Grafana의 아래 대시보드를 같이 보세요.

- `Node.js Application Overview`
- `HTTP Performance`
- `Infrastructure Health`
- `BullMQ Job Queue`
- `HTTP Request Logs`

접속:

- `http://localhost:${GRAFANA_HOST_PORT:-3001}`

## 로그 확인 방법

### 로컬 stdout 로그

개발 환경에서는 `LOG_STDOUT_ENABLED=true` 이므로 앱 로그가 표준출력에도 표시됩니다.

```bash
docker compose logs -f app
```

### Loki/Grafana 로그

1. Grafana 접속: `http://localhost:3001`
2. 로그인: `.env`의 `GRAFANA_ADMIN_USER` / `GRAFANA_ADMIN_PASSWORD`
3. 좌측 메뉴에서 **Explore**
4. Data source를 **Loki**로 선택
5. 아래 쿼리 실행

```logql
{app="admin"}
```

환경까지 같이 보려면:

```logql
{app="admin", env="development"}
```

### Loki API로 직접 확인

```bash
curl -G http://localhost:3100/loki/api/v1/query_range \
  --data-urlencode 'query={app="admin"}' \
  --data-urlencode 'limit=20'
```

## 다음 마이그레이션 우선순위

1. 실제 MariaDB Entity 정의 및 Migration 추가
2. Auth 모듈(OAuth + JWT + Redis Session) 구체화
3. `manager`, `member`, `coupon` 순으로 도메인 마이그레이션
4. 외부 서비스 / RBAC / 캐시 무효화 정책 구현

## 참고

Nest 공식 문서 기준으로 URI Versioning을 적용해 예시 라우트는 `/v1/admin/...` 형태로 구성했습니다.
