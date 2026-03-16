# Barebones NestJS Scaffold

Barebones는 **중립적인 시작점만 제공하는 NestJS 스캐폴드**다.  
여기에는 admin/user 전용 runtime 분기 구조를 넣지 않고, 공통적으로 자주 필요한 기반만 남겨둔다.

즉:

- 이 저장소 자체는 **barebones-only**
- admin 앱이 필요하면 이 scaffold를 기반으로 admin 프로젝트에서 확장
- user 앱이 필요하면 user 프로젝트에서 별도로 확장

## 현재 포함된 것

- NestJS 11 부트스트랩
- `@nestjs/config` + Joi 환경변수 검증
- `nestjs-pino` 구조화 로그
- TypeORM (`mariadb` 기본 / 테스트 `sqljs`)
- Redis / CacheModule / BullMQ
- Prometheus metrics
- Health Check (DB + Redis + Memory + Disk)
- 전역 Validation Pipe / Exception Filter / Response Interceptor
- Swagger 문서
- Auth / User 시작점
- Docker Compose 개발 환경
- Jest Unit / E2E 테스트

## 기본 엔드포인트

- Swagger: `/docs`
- Health: `/v1/system/health`
- Metrics: `/v1/system/metrics`

## 시작하기

```bash
yarn install
cp .env.example .env
yarn start:dev
```

기본 확인:

- `http://localhost:3000/docs`
- `http://localhost:3000/v1/system/health`
- `http://localhost:3000/v1/system/metrics`

## Docker 기반 개발 환경

```bash
docker compose up -d
```

`docker-compose.yml` 기본값도 barebones 기준으로 맞춰져 있다.

## 환경변수 기본 방향

핵심 기본값:

```env
APP_NAME=barebones
APP_SWAGGER_PATH=docs
PROMETHEUS_ENABLED=true
PROMETHEUS_METRIC_PREFIX=app_
REDIS_KEY_PREFIX=app:
BULLMQ_PREFIX=app
```

## Prometheus / Grafana

현재 ops 파일 기본값은 barebones 기준이다.

- scrape path: `/v1/system/metrics`
- metrics prefix: `app_`

Starter query:

```promql
app_app_up
app_process_resident_memory_bytes
app_health_check_status
```

HTTP 요청 후 확인:

```promql
app_http_request_duration_seconds_count
```

예시 호출:

- `http://localhost:${APP_HOST_PORT:-3000}/v1/system/health`

## 이 scaffold를 확장하는 방법

### admin 앱으로 확장

- admin 전용 route prefix 추가
- admin 전용 docs wording 추가
- admin 전용 module / auth 정책 추가

### user 앱으로 확장

- user-facing route 구조 추가
- user 전용 docs / feature module 추가
- 필요한 경우 auth 정책 직접 추가

중요한 건 **이 저장소 안에 admin/user 둘 다를 runtime으로 품지 않는 것**이다.  
Barebones는 공통 기반만 제공하고, 제품별 성격은 파생 프로젝트에서 얹는다.

## 검증

```bash
yarn lint
yarn typecheck
yarn test
yarn test:e2e
```
