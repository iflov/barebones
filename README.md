# Barebones NestJS Scaffold

Barebones는 **중립적인 시작점만 제공하는 NestJS 스캐폴드**다.  
여기에는 admin/user 전용 runtime 분기 구조를 넣지 않고, 공통적으로 자주 필요한 기반만 남겨둔다.

즉:

- 이 저장소 자체는 **barebones-only**
- admin 앱이 필요하면 이 scaffold를 기반으로 admin 프로젝트에서 확장
- user 앱이 필요하면 user 프로젝트에서 별도로 확장

**도메인 모듈은 하나도 없다.** auth도 user도 없다. 여기 있는 것은 도메인을 만들 때
지켜야 할 **골격과 가드레일**이며, 실제 도메인은 파생 프로젝트에 만든다.

## 현재 포함된 것

- NestJS 11 부트스트랩 + graceful shutdown (드레인 타임아웃 포함)
- `@nestjs/config` + Joi 환경변수 검증 (**검증 실패 = 부팅 실패**, production 강화 규칙 포함)
- `nestjs-pino` 구조화 로그 → Loki
- TypeORM + **영속화 포트**(`IRepository<T>`) — `postgres` 기본 / `mysql` / `mariadb`
- Redis / CacheModule / BullMQ
- Prometheus metrics + Grafana 대시보드 5종 (설정 1개에서 **생성**)
- Health Check (DB + Redis + Memory + Disk) — 비활성 의존성도 목록에서 빼지 않고 `down`으로 보고
- 전역 Validation Pipe / Exception Filter / Response Interceptor / CORS
- Swagger 문서 (`APP_SWAGGER_ENABLED`로 끌 수 있음)
- Docker Compose 개발 환경 (postgres·redis 영속화 + healthcheck 대기)
- Jest Unit / E2E 테스트
- **프로젝트 규칙(`constitution.md`)과 명세 주도 개발 파이프라인(GitHub Spec Kit)**
- 계층 경계를 **eslint가 강제** — 규칙 위반이 빌드 실패가 된다

## 기본 엔드포인트

- Swagger: `/docs`
- Health: `/v1/system/health`
- Metrics: `/v1/system/metrics`

## 시작하기

**전부 docker compose로 돌린다.** 호스트에 node를 맞춰 깔 필요가 없고, 로컬과 배포가
같은 이미지·같은 의존성·같은 node 버전을 쓴다.

```bash
cp .env.example .env
docker compose up -d --build   # postgres, redis, loki, prometheus, grafana, app
docker compose logs -f app
```

`app`은 소스를 마운트한 watch 모드로 뜬다 — `src/`를 고치면 자동으로 다시 컴파일된다.
명령은 컨테이너 안에서 실행한다:

```bash
docker compose exec app yarn test
```

기본 확인:

- `http://localhost:3000/docs`
- `http://localhost:3000/v1/system/health`
- `http://localhost:3000/v1/system/metrics`

## 이 스캐폴드를 쓸 때 먼저 읽을 것

| 문서                                      | 담는 것                                                 |
| ----------------------------------------- | ------------------------------------------------------- |
| `.specify/memory/constitution.md`         | **지켜야 하는 규칙** — 설계 원칙과 품질 기준            |
| `.specify/memory/constitution-history.md` | 각 규칙이 **왜** 그렇게 정해졌는지                      |
| `CLAUDE.md`                               | **실행 방법** — 명령어, 디렉토리, 새 도메인 만드는 순서 |

셋을 섞지 않는다. 판별법은 **"도구를 바꿔도 이 문장이 그대로인가?"** —
그렇다면 constitution, 아니면 `CLAUDE.md`.

## 데이터 접근 구조

도메인 코드는 TypeORM을 모른다. 포트 하나만 본다.

```
Service  →  <Domain>Repository  →  IRepository<T>  →  TypeOrmRepositoryAdapter  →  DB
         ↑ 도메인 시그니처만    ↑ 포트 경계 (src/common/persistence/)
```

- **DB 드라이버 교체**: `DB_TYPE`만 바꾼다 (`postgres` / `mysql` / `mariadb`). 코드 변경 없음.
- **ORM 교체**: `src/common/persistence/`의 어댑터 하나를 새로 쓴다. 도메인 코드는 그대로.
- 포트는 **Repository와 ORM 사이**에 있다. Service와 Repository 사이가 아니다 —
  그 이유는 `constitution.md` A-1-P에 있다(한 칸만 올리면 테이블 불변식이 선택사항이 된다).
- 조건이 사라져 의도보다 많은 행에 닿는 입력은 **막힌다** — `where` 값의 `undefined`,
  `findOne`/`update`/`remove`의 빈 `where`. `insert`는 upsert가 아니라 진짜 INSERT라
  중복 키를 조용히 덮어쓰지 않는다.

TypeORM import는 `src/common/persistence/**`, `src/config/**`, `src/database/**` 밖에서
**eslint가 차단**한다(`src/**`와 `test/**` 양쪽). 위반하면 빌드가 실패하고 에러 메시지가
위반한 조항 번호를 가리킨다.

## 명세 주도 개발 (SDD)

새 엔드포인트 / 새 엔티티·마이그레이션 / 새 환경변수 / 계층 경계 변경이 포함되면
명세부터 시작한다. 오타·문서·포맷팅은 그냥 고친다.

```
/speckit-specify → /speckit-plan → /speckit-tasks → /speckit-implement
```

산출물은 `specs/NNN-<slug>/`에 `spec.md` / `plan.md` / `tasks.md`로 쌓인다.
자세한 절차와 함정은 `CLAUDE.md`를 본다.

## 완료 게이트

```bash
docker compose exec app sh -c 'yarn lint && yarn typecheck && yarn test && yarn test:e2e'
```

observability 관련 변경이 있었다면 `yarn check:observability`도 포함한다.
**통과 로그 없이 완료를 선언하지 않는다.**

## 환경변수 기본 방향

핵심 기본값:

```env
APP_NAME=barebones
APP_SWAGGER_ENABLED=true
APP_SWAGGER_PATH=docs
APP_SHUTDOWN_TIMEOUT_MS=10000
CORS_ORIGINS=*                 # production에서는 '*' 금지 (부팅이 거부된다)
DB_TYPE=postgres
PROMETHEUS_ENABLED=true
REDIS_KEY_PREFIX=app:
BULLMQ_PREFIX=app
```

`.env.example`이 전체 목록이고, 각 값의 설명이 주석으로 붙어 있다.
새 환경변수를 추가하면 `env.validation.ts` / `.env.example` / `docker-compose.yml`을
**같은 커밋에서** 갱신한다.

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
2. 생성 실행 — `ops/`는 마운트돼 있지 않으므로 그때만 마운트한다

```bash
docker compose run --rm --no-deps -v "$PWD/ops:/app/ops" app yarn generate:observability
```

3. drift 체크

```bash
docker compose exec app yarn check:observability
```

4. 스택 반영

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

### 관측 생성물을 손으로 고치지 않는 이유

`ops/**`는 생성기가 소유한다. 그리고 이 파일들은 `.prettierignore`에 있다 —
생성기는 `JSON.stringify(..., 2)`로 배열을 펼쳐 쓰는데 prettier는 짧은 배열을 한 줄로 접는다.
둘 다 걸어두면 **커밋마다 lint-staged가 접고 `check:observability`가 stale로 실패하는 왕복**이 된다.

## 이 scaffold를 확장하는 방법

파생 프로젝트를 만들고 거기서 도메인을 얹는다. 이 저장소에는 도메인을 넣지 않는다.

1. **규칙을 자기 것으로 만든다** — `.specify/memory/constitution.md`를 복사한 뒤
   도메인 규칙·인증 정책·선택한 DB의 세부 조항을 추가한다. 그 추가분을 이 저장소로 되돌리지 않는다.
2. **DB를 정한다** — `DB_TYPE`과 드라이버 패키지. 다른 DB가 필요하면
   `SupportedDbType` / Joi `valid(...)` / 패키지를 같은 커밋에서 갱신한다.
3. **도메인을 만든다** — `CLAUDE.md`의 "새 도메인을 만들 때 순서"를 따른다.
   엔티티 → Repository(포트 주입) → Service(판단만) → Controller → Module 배선.
4. **명세부터 시작한다** — 새 엔드포인트·엔티티·환경변수가 생기면 `/speckit-specify`.

중요한 건 **이 저장소 안에 admin/user 둘 다를 runtime으로 품지 않는 것**이다.  
Barebones는 공통 기반만 제공하고, 제품별 성격은 파생 프로젝트에서 얹는다.

## 검증

```bash
docker compose exec app sh -c 'yarn check:observability && yarn lint && yarn typecheck && yarn test && yarn test:e2e'
```
