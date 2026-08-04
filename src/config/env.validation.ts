import * as Joi from 'joi';

import { CORS_WILDCARD, hasWildcardOrigin, parseCorsOrigins } from './cors.config';

/**
 * production에서 허용되는 `CORS_ORIGINS`.
 *
 * **원문 문자열이 아니라 파싱된 목록을 검사한다** — `invalid('*')`만 걸어두면
 * `'https://app.example.com,*'`나 공백이 붙은 `' * '`가 통과한 뒤 런타임에 전체 허용이 된다.
 * 검증과 소비가 같은 파서(`parseCorsOrigins`)를 공유해야 이 종류의 우회가 생기지 않는다.
 */
const productionCorsOrigins = Joi.string()
  .required()
  .custom((value: string, helpers) => {
    const origins = parseCorsOrigins(value);

    if (origins.length === 0) {
      return helpers.error('env.corsOriginsEmpty');
    }

    if (hasWildcardOrigin(value)) {
      return helpers.error('env.corsOriginsWildcard');
    }

    const invalid = origins.filter((origin) => !origin.includes('://'));

    if (invalid.length > 0) {
      return helpers.error('env.corsOriginsMalformed', { invalid: invalid.join(', ') });
    }

    return value;
  }, 'cors origin list')
  .messages({
    'env.corsOriginsEmpty': '"CORS_ORIGINS" must list at least one origin in production',
    'env.corsOriginsMalformed':
      '"CORS_ORIGINS" entries must include a scheme (got: {{#invalid}}). Browsers send Origin as scheme://host[:port]',
    'env.corsOriginsWildcard': `"CORS_ORIGINS" must not contain "${CORS_WILDCARD}" in production, not even inside a list`,
  });

/**
 * 환경변수 스키마.
 *
 * **검증 실패는 부팅 실패다** (constitution A-3). "떴는데 설정이 비어서 런타임에 터지는"
 * 상태보다 "안 뜨는" 상태가 항상 낫다.
 *
 * 새 환경변수를 추가하면 이 파일 / `.env.example` / `docker-compose.yml`을
 * **같은 커밋에서** 갱신한다.
 */
export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  APP_NAME: Joi.string().default('barebones'),
  APP_PORT: Joi.number().port().default(3000),
  APP_SHUTDOWN_TIMEOUT_MS: Joi.number().integer().positive().default(10_000),
  APP_SWAGGER_PATH: Joi.string().default('docs'),
  APP_SWAGGER_TITLE: Joi.string().default('Barebones API'),
  APP_SWAGGER_DESCRIPTION: Joi.string().default('Reusable NestJS product scaffold'),
  APP_SWAGGER_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),
  // 신뢰할 프록시 홉 수. 0 = 프록시 없음(로컬). ALB 하나면 1, CloudFront까지면 2.
  // boolean이 아니라 숫자만 받는다 — "전부 신뢰"는 XFF 위조로 throttle을 우회시킨다.
  TRUST_PROXY_HOPS: Joi.number().integer().min(0).max(10).default(0),
  CORS_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),
  CORS_ORIGINS: Joi.string().default('*'),
  CORS_CREDENTIALS: Joi.boolean().truthy('true').falsy('false').default(true),
  LOG_LEVEL: Joi.string().valid('trace', 'debug', 'info', 'warn', 'error', 'fatal').default('info'),
  LOG_LOKI_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  LOG_STDOUT_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),
  LOKI_HOST: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .default('http://localhost:3100'),
  DOCKER_LOKI_HOST: Joi.string().default('http://localhost:3100'),
  LOKI_HOST_PORT: Joi.number().port().default(3100),
  THROTTLE_TTL: Joi.number().integer().positive().default(60_000),
  THROTTLE_LIMIT: Joi.number().integer().positive().default(100),
  HEALTH_MEMORY_HEAP_THRESHOLD: Joi.number().integer().positive().default(536_870_912),
  REDIS_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),
  REDIS_HOST: Joi.string().hostname().default('localhost'),
  DOCKER_REDIS_HOST: Joi.string().default('redis'),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_HOST_PORT: Joi.number().port().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').default(''),
  REDIS_DB: Joi.number().integer().min(0).default(0),
  REDIS_KEY_PREFIX: Joi.string().default('app:'),
  CACHE_TTL: Joi.number().integer().positive().default(60_000),
  BULLMQ_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),
  BULLMQ_PREFIX: Joi.string().default('app'),
  PROMETHEUS_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),
  PROMETHEUS_HOST_PORT: Joi.number().port().default(9090),
  // 드라이버를 추가할 때 database.config.ts의 SupportedDbType과 함께 갱신한다.
  DB_TYPE: Joi.string().valid('postgres', 'mysql', 'mariadb', 'sqljs').default('postgres'),
  DB_HOST: Joi.string().hostname().default('localhost'),
  DOCKER_DB_HOST: Joi.string().hostname().default('postgres'),
  DB_PORT: Joi.number().port().default(5432),
  DB_HOST_PORT: Joi.number().port().default(5432),
  DB_USERNAME: Joi.string().default('app'),
  DB_PASSWORD: Joi.string().allow('').default('app'),
  DB_DATABASE: Joi.string().default('app'),
  DB_SCHEMA: Joi.string().default('public'),
  DB_LOGGING: Joi.boolean().truthy('true').falsy('false').default(false),
  DB_SSL: Joi.boolean().truthy('true').falsy('false').default(false),
  // CA를 주면 인증서 검증을 켠 채로 관리형 DB에 붙을 수 있다 (PEM 내용).
  DB_SSL_CA: Joi.string().allow('').default(''),
  // 기본값 true. false는 TLS의 신원 확인을 끄는 것이고 production에서는 거부된다.
  DB_SSL_REJECT_UNAUTHORIZED: Joi.boolean().truthy('true').falsy('false').default(true),
  GRAFANA_HOST_PORT: Joi.number().port().default(3001),
  GRAFANA_ADMIN_USER: Joi.string(),
  GRAFANA_ADMIN_PASSWORD: Joi.string(),
})
  // NODE_ENV가 명시적으로 production일 때만 강화 규칙을 적용한다.
  // (required()가 없으면 NODE_ENV 미지정 = 조건 통과로 취급되어 dev에서도 걸린다.)
  .when(Joi.object({ NODE_ENV: Joi.string().valid('production').required() }).unknown(), {
    then: Joi.object({
      // 빈 비밀번호로 뜬 DB는 열린 DB다.
      //
      // ⚠ `min(1)`만으로는 막히지 않는다. base 스키마의 `allow('')`가 ''를 valids에 등록해서
      // Joi가 길이 규칙을 보기 전에 통과시킨다. `invalid('')`로 명시적으로 뒤집어야 한다.
      DB_PASSWORD: Joi.string().min(1).invalid('').required(),
      // '*'는 credentials와 함께 쓸 수 없고, 쓸 수 있더라도 그건 CORS를 끈 것과 같다.
      // 목록 안에 섞인 '*'까지 잡으려면 파싱된 형태를 봐야 한다 (위 productionCorsOrigins).
      CORS_ORIGINS: productionCorsOrigins,
      // sqljs는 인메모리라 재시작마다 데이터가 사라진다. 운영 DB가 될 수 없다.
      DB_TYPE: Joi.string().invalid('sqljs'),
      // TLS 신원 확인을 끈 채로 배포하는 것을 막는다. 암호화는 되지만 중간자를 구분할 수 없어
      // DB 비밀번호와 모든 쿼리가 평문으로 읽힌다 — 그런데 **작동은 한다**(database.config.ts 참고).
      DB_SSL_REJECT_UNAUTHORIZED: Joi.boolean().valid(true),
    }),
  });
