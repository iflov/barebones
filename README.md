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

Grafana:

- `http://localhost:3001`
- id: `admin`
- pw: `admin`

Prometheus:

- `http://localhost:9090`

## 로그 확인 방법

### 로컬 stdout 로그

개발 환경에서는 `LOG_STDOUT_ENABLED=true` 이므로 앱 로그가 표준출력에도 표시됩니다.

```bash
docker compose logs -f app
```

### Loki/Grafana 로그

1. Grafana 접속: `http://localhost:3001`
2. 로그인: `admin` / `admin`
3. 좌측 메뉴에서 **Explore**
4. Data source를 **Loki**로 선택
5. 아래 쿼리 실행

```logql
{app="barebones-admin"}
```

환경까지 같이 보려면:

```logql
{app="barebones-admin", env="development"}
```

### Loki API로 직접 확인

```bash
curl -G http://localhost:3100/loki/api/v1/query_range \
  --data-urlencode 'query={app="barebones-admin"}' \
  --data-urlencode 'limit=20'
```

## 다음 마이그레이션 우선순위

1. 실제 MariaDB Entity 정의 및 Migration 추가
2. Auth 모듈(OAuth + JWT + Redis Session) 구체화
3. `manager`, `member`, `coupon` 순으로 도메인 마이그레이션
4. 외부 서비스 / RBAC / 캐시 무효화 정책 구현

## 참고

Nest 공식 문서 기준으로 URI Versioning을 적용해 예시 라우트는 `/v1/admin/...` 형태로 구성했습니다.
