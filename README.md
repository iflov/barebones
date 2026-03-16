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

현재 observability 기본값은 `config/observability.config.json`에서 관리한다.

- scrape path: `/v1/system/metrics`
- metrics prefix: `app_`
- scrape job: `app`

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

### observability 설정을 바꾸는 방법

drift가 자주 나는 값은 `.env`가 아니라 아래 파일에서 관리한다.

```txt
config/observability.config.json
```

현재 이 파일이 담당하는 값:

- metric prefix
- Prometheus scrape job 이름
- Prometheus scrape target
- Prometheus scrape path
- Grafana Prometheus dashboard에서 제외할 route

예:

```json
{
  "metrics": {
    "prefix": "app_"
  },
  "prometheus": {
    "jobName": "app",
    "scrapeTarget": "app:3000",
    "metricsPath": "/v1/system/metrics"
  }
}
```

### 설정을 바꾼 뒤 해야 하는 일

1. `config/observability.config.json` 수정
2. 생성 실행

```bash
yarn generate:observability
```

3. drift 체크

```bash
yarn check:observability
```

4. Docker 스택 재시작

```bash
docker compose up -d --build
```

### 언제 `.env`를 바꾸고 언제 observability config를 바꾸나

#### `.env`

- 앱 이름
- 앱 포트
- DB/Redis 연결값
- 로컬 런타임/컨테이너 실행값

#### `config/observability.config.json`

- Prometheus가 무엇을 어떻게 scrape할지
- Grafana Prometheus 대시보드가 어떤 metric prefix / job / route filter를 사용할지

즉:

- **앱 실행 자체**를 바꾸면 `.env`
- **관측/대시보드 의미**를 바꾸면 `observability.config.json`

### 왜 이렇게 나눴나

예전에 실제로:

- 앱은 `admin_` prefix로 메트릭을 내보내고
- Grafana는 `app_`를 조회해서

HTTP Performance 패널이 비어 보이는 문제가 있었다.

이제는 observability 관련 값들을 한 곳에서 바꾸고, Prometheus/Grafana 파일은 생성해서 맞추는 방식으로 drift를 줄인다.

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
yarn generate:observability
yarn check:observability
yarn lint
yarn typecheck
yarn test
yarn test:e2e
```
