import { ConfigModule } from '@nestjs/config';

import { validationSchema } from './env.validation.js';

describe('validationSchema', () => {
  it('allows unrelated process variables through the ConfigModule Standard Schema path', async () => {
    process.env.BAREBONES_TEST_UNKNOWN = 'kept';

    try {
      await expect(
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          validationSchema,
          validationOptions: {
            libraryOptions: {
              abortEarly: false,
              allowUnknown: true,
            },
          },
        }),
      ).resolves.toMatchObject({ module: ConfigModule });
    } finally {
      delete process.env.BAREBONES_TEST_UNKNOWN;
    }
  });

  describe('defaults', () => {
    it('fills all defaults', () => {
      const { value, error } = validationSchema.validate({});

      expect(error).toBeUndefined();
      expect(value.NODE_ENV).toBe('development');
      expect(value.APP_NAME).toBe('barebones');
      expect(value.APP_PORT).toBe(3000);
      expect(value.APP_SHUTDOWN_TIMEOUT_MS).toBe(10_000);
      expect(value.TRUST_PROXY_HOPS).toBe(0);
      expect(value.APP_SWAGGER_ENABLED).toBe(true);
      expect(value.APP_SWAGGER_PATH).toBe('docs');
      expect(value.APP_SWAGGER_TITLE).toBe('Barebones API');
      expect(value.APP_SWAGGER_DESCRIPTION).toBe('Reusable NestJS product scaffold');
      expect(value.CORS_ENABLED).toBe(true);
      expect(value.CORS_ORIGINS).toBe('*');
      expect(value.CORS_CREDENTIALS).toBe(true);
      expect(value.LOG_LEVEL).toBe('info');
      expect(value.LOG_LOKI_ENABLED).toBe(false);
      expect(value.LOG_STDOUT_ENABLED).toBe(true);
      expect(value.LOKI_HOST).toBe('http://localhost:3100');
      expect(value.DOCKER_LOKI_HOST).toBe('http://localhost:3100');
      expect(value.LOKI_HOST_PORT).toBe(3100);
      expect(value.THROTTLE_TTL).toBe(60_000);
      expect(value.THROTTLE_LIMIT).toBe(100);
      expect(value.HEALTH_MEMORY_HEAP_THRESHOLD).toBe(536_870_912);
      expect(value.REDIS_ENABLED).toBe(true);
      expect(value.REDIS_HOST).toBe('localhost');
      expect(value.DOCKER_REDIS_HOST).toBe('redis');
      expect(value.REDIS_PORT).toBe(6379);
      expect(value.REDIS_HOST_PORT).toBe(6379);
      expect(value.REDIS_PASSWORD).toBe('');
      expect(value.REDIS_DB).toBe(0);
      expect(value.REDIS_KEY_PREFIX).toBe('app:');
      expect(value.CACHE_TTL).toBe(60_000);
      expect(value.BULLMQ_ENABLED).toBe(true);
      expect(value.BULLMQ_PREFIX).toBe('app');
      expect(value.PROMETHEUS_ENABLED).toBe(true);
      expect(value.PROMETHEUS_HOST_PORT).toBe(9090);
      expect(value.MONGODB_ENABLED).toBe(true);
      expect(value.MONGODB_URI).toBe('');
      expect(value.MONGODB_HOST).toBe('localhost');
      expect(value.DOCKER_MONGODB_HOST).toBe('mongodb');
      expect(value.MONGODB_PORT).toBe(27017);
      expect(value.MONGODB_HOST_PORT).toBe(27017);
      expect(value.MONGODB_USERNAME).toBe('app');
      expect(value.MONGODB_PASSWORD).toBe('app');
      expect(value.MONGODB_DATABASE).toBe('app');
      expect(value.MONGODB_AUTH_SOURCE).toBe('admin');
      expect(value.DB_TYPE).toBe('postgres');
      expect(value.DB_HOST).toBe('localhost');
      expect(value.DOCKER_DB_HOST).toBe('postgres');
      expect(value.DB_PORT).toBe(5432);
      expect(value.DB_HOST_PORT).toBe(5432);
      expect(value.DB_USERNAME).toBe('app');
      expect(value.DB_PASSWORD).toBe('app');
      expect(value.DB_DATABASE).toBe('app');
      expect(value.DB_SCHEMA).toBe('public');
      expect(value.DB_LOGGING).toBe(false);
      expect(value.DB_SSL).toBe(false);
      expect(value.DB_SSL_CA).toBe('');
      expect(value.DB_SSL_REJECT_UNAUTHORIZED).toBe(true);
      expect(value.GRAFANA_HOST_PORT).toBe(3001);
    });
  });

  describe('valid inputs', () => {
    it('accepts fully customized values', () => {
      const input = {
        NODE_ENV: 'development',
        APP_NAME: 'my-app',
        APP_PORT: 8080,
        APP_SHUTDOWN_TIMEOUT_MS: 30_000,
        APP_SWAGGER_ENABLED: false,
        APP_SWAGGER_PATH: 'api/docs',
        APP_SWAGGER_TITLE: 'My App API',
        APP_SWAGGER_DESCRIPTION: 'My custom app',
        CORS_ENABLED: false,
        CORS_ORIGINS: 'https://app.example.com,https://admin.example.com',
        CORS_CREDENTIALS: false,
        LOG_LEVEL: 'debug',
        LOG_LOKI_ENABLED: true,
        LOG_STDOUT_ENABLED: false,
        LOKI_HOST: 'https://loki.example.com',
        DOCKER_LOKI_HOST: 'http://loki:3100',
        LOKI_HOST_PORT: 3101,
        THROTTLE_TTL: 30_000,
        THROTTLE_LIMIT: 50,
        HEALTH_MEMORY_HEAP_THRESHOLD: 1_073_741_824,
        REDIS_ENABLED: false,
        REDIS_HOST: 'redis.example.com',
        DOCKER_REDIS_HOST: 'my-redis',
        REDIS_PORT: 6380,
        REDIS_HOST_PORT: 6380,
        REDIS_PASSWORD: 'secret',
        REDIS_DB: 2,
        REDIS_KEY_PREFIX: 'myapp:',
        CACHE_TTL: 30_000,
        BULLMQ_ENABLED: false,
        BULLMQ_PREFIX: 'myapp',
        PROMETHEUS_ENABLED: false,
        PROMETHEUS_HOST_PORT: 9091,
        MONGODB_ENABLED: true,
        MONGODB_URI: 'mongodb+srv://cluster.example/app',
        MONGODB_HOST: 'mongo.example.com',
        DOCKER_MONGODB_HOST: 'mongodb',
        MONGODB_PORT: 27018,
        MONGODB_HOST_PORT: 27018,
        MONGODB_USERNAME: 'mongo-user',
        MONGODB_PASSWORD: 'mongo-pass',
        MONGODB_DATABASE: 'mongo-app',
        MONGODB_AUTH_SOURCE: 'admin',
        DB_TYPE: 'postgres',
        DB_HOST: 'db.example.com',
        DOCKER_DB_HOST: 'my-postgres',
        DB_PORT: 5433,
        DB_HOST_PORT: 5433,
        DB_USERNAME: 'root',
        DB_PASSWORD: 'rootpass',
        DB_DATABASE: 'mydb',
        DB_SCHEMA: 'app',
        DB_LOGGING: true,
        DB_SSL: true,
        GRAFANA_HOST_PORT: 3002,
        GRAFANA_ADMIN_USER: 'admin',
        GRAFANA_ADMIN_PASSWORD: 'grafana-secret',
      };

      const { value, error } = validationSchema.validate(input);

      expect(error).toBeUndefined();
      expect(value.APP_PORT).toBe(8080);
      expect(value.DB_TYPE).toBe('postgres');
      expect(value.DB_SCHEMA).toBe('app');
      expect(value.REDIS_DB).toBe(2);
      expect(value.MONGODB_PORT).toBe(27018);
    });

    it('accepts the generated DB_TYPE', () => {
      const { value, error } = validationSchema.validate({ DB_TYPE: 'postgres' });

      expect(error).toBeUndefined();
      expect(value.DB_TYPE).toBe('postgres');
    });

    it.each(['mysql', 'mariadb'])('rejects runtime DB_TYPE override = %s', (dbType) => {
      const { error } = validationSchema.validate({ DB_TYPE: dbType });

      expect(error).toBeDefined();
      expect(error!.details[0].message).toContain('DB_TYPE');
    });
  });

  describe('invalid inputs', () => {
    it.each([
      ['NODE_ENV', 'staging', '"NODE_ENV" must be one of'],
      ['APP_PORT', 99999, '"APP_PORT" must be a valid port'],
      ['APP_PORT', -1, '"APP_PORT" must be a valid port'],
      ['APP_SHUTDOWN_TIMEOUT_MS', 0, '"APP_SHUTDOWN_TIMEOUT_MS" must be a positive number'],
      ['TRUST_PROXY_HOPS', -1, '"TRUST_PROXY_HOPS" must be greater than or equal to 0'],
      ['TRUST_PROXY_HOPS', 1.5, '"TRUST_PROXY_HOPS" must be an integer'],
      // 숫자만 받는다 — "전부 신뢰"는 X-Forwarded-For 위조로 throttle을 우회시킨다.
      ['TRUST_PROXY_HOPS', 'true', '"TRUST_PROXY_HOPS" must be a number'],
      ['LOG_LEVEL', 'verbose', '"LOG_LEVEL" must be one of'],
      ['LOKI_HOST', 'not-a-uri', '"LOKI_HOST" must be a valid uri'],
      ['LOKI_HOST', 'ftp://loki.local', '"LOKI_HOST" must be a valid uri'],
      ['LOKI_HOST_PORT', 70000, '"LOKI_HOST_PORT" must be a valid port'],
      ['THROTTLE_TTL', -1, '"THROTTLE_TTL" must be a positive number'],
      ['THROTTLE_TTL', 3.5, '"THROTTLE_TTL" must be an integer'],
      ['THROTTLE_LIMIT', 0, '"THROTTLE_LIMIT" must be a positive number'],
      [
        'HEALTH_MEMORY_HEAP_THRESHOLD',
        -100,
        '"HEALTH_MEMORY_HEAP_THRESHOLD" must be a positive number',
      ],
      ['REDIS_HOST', '!!!invalid', '"REDIS_HOST" must be a valid hostname'],
      ['REDIS_PORT', 70000, '"REDIS_PORT" must be a valid port'],
      ['REDIS_DB', -1, '"REDIS_DB" must be greater than or equal to 0'],
      ['CACHE_TTL', 0, '"CACHE_TTL" must be a positive number'],
      ['MONGODB_HOST', '!!!invalid', '"MONGODB_HOST" must be a valid hostname'],
      ['MONGODB_URI', 'https://example.com', '"MONGODB_URI" must be a valid uri'],
      ['DOCKER_MONGODB_HOST', '!!!invalid', '"DOCKER_MONGODB_HOST" must be a valid hostname'],
      ['MONGODB_PORT', 70000, '"MONGODB_PORT" must be a valid port'],
      ['MONGODB_HOST_PORT', 70000, '"MONGODB_HOST_PORT" must be a valid port'],
      ['DB_TYPE', 'oracle', '"DB_TYPE" must be [postgres]'],
      ['DB_HOST', '!!!invalid', '"DB_HOST" must be a valid hostname'],
      ['DOCKER_DB_HOST', '!!!invalid', '"DOCKER_DB_HOST" must be a valid hostname'],
      ['DB_PORT', 99999, '"DB_PORT" must be a valid port'],
      ['DB_HOST_PORT', 99999, '"DB_HOST_PORT" must be a valid port'],
      ['GRAFANA_HOST_PORT', 99999, '"GRAFANA_HOST_PORT" must be a valid port'],
    ])('rejects %s = %s', (key, input, expectedMessage) => {
      const payload = {
        [key]: input,
      };
      const { error } = validationSchema.validate(payload);

      expect(error).toBeDefined();
      expect(error!.details[0].message).toContain(expectedMessage);
    });

    it('rejects keys that are not in the schema', () => {
      const { error } = validationSchema.validate({ MARIADB_ROOT_PASSWORD: 'root' });

      expect(error!.details[0].message).toContain('is not allowed');
    });
  });

  /**
   * production 강화 규칙 (constitution A-3).
   *
   * 이 규칙들이 부팅을 막는 것이 핵심이다 — 잘못된 설정으로 뜬 서버는
   * 문제가 드러날 때까지 정상으로 보인다.
   */
  describe('production hardening', () => {
    /**
     * 통과하는 production 설정을 만들고, 검사할 항목만 명시적으로 덮는다.
     *
     * `{ ...base, X }` 대신 필드를 전부 적는 이유 (constitution A-5): 이 함수만 보면
     * Joi에 무엇이 들어가는지 알 수 있어야 한다. spread면 `base`를 찾아가야 하고,
     * 어떤 테스트가 무엇을 바꿨는지도 한 번 더 대조해야 한다.
     */
    function productionEnv(
      overrides: {
        CORS_ORIGINS?: string;
        DB_PASSWORD?: string;
        DB_SSL_REJECT_UNAUTHORIZED?: string;
        DB_TYPE?: string;
      } = {},
    ): Record<string, unknown> {
      return {
        CORS_ORIGINS: overrides.CORS_ORIGINS ?? 'https://app.example.com',
        DB_PASSWORD: overrides.DB_PASSWORD ?? 'a-real-password',
        DB_SSL_REJECT_UNAUTHORIZED: overrides.DB_SSL_REJECT_UNAUTHORIZED,
        DB_TYPE: overrides.DB_TYPE,
        NODE_ENV: 'production',
      };
    }

    it('accepts a properly configured production env', () => {
      const { error } = validationSchema.validate(productionEnv());

      expect(error).toBeUndefined();
    });

    it('rejects an empty DB_PASSWORD (development에서는 허용되는 값)', () => {
      const { error } = validationSchema.validate(productionEnv({ DB_PASSWORD: '' }));

      expect(error).toBeDefined();
      expect(error!.details[0].message).toContain('DB_PASSWORD');
    });

    /**
     * 원문 문자열만 검사하던 시절의 회귀 테스트.
     *
     * `invalid('*')`는 정확히 `'*'`인 값만 막아서, 목록 안에 섞인 `*`와 공백이 붙은 `' * '`가
     * 통과한 뒤 런타임에 전체 origin 허용이 됐다. 검증은 **소비하는 형태**(파싱된 목록)를
     * 대상으로 해야 한다.
     */
    it.each(['*', ' * ', 'https://app.example.com,*', '*,https://app.example.com'])(
      "rejects a wildcard anywhere in CORS_ORIGINS: '%s'",
      (origins) => {
        const { error } = validationSchema.validate(productionEnv({ CORS_ORIGINS: origins }));

        expect(error).toBeDefined();
        expect(error!.details[0].message).toContain('CORS_ORIGINS');
      },
    );

    it('accepts a multi-origin list', () => {
      const { error } = validationSchema.validate(
        productionEnv({ CORS_ORIGINS: 'https://app.example.com, https://admin.example.com' }),
      );

      expect(error).toBeUndefined();
    });

    it('rejects an origin without a scheme — 브라우저 Origin 헤더와 절대 일치하지 않는다', () => {
      const { error } = validationSchema.validate(
        productionEnv({ CORS_ORIGINS: 'app.example.com' }),
      );

      expect(error).toBeDefined();
      expect(error!.details[0].message).toContain('scheme');
    });

    it('rejects an empty CORS_ORIGINS list', () => {
      const { error } = validationSchema.validate(productionEnv({ CORS_ORIGINS: ' , ' }));

      expect(error).toBeDefined();
      expect(error!.details[0].message).toContain('CORS_ORIGINS');
    });

    it('rejects a missing CORS_ORIGINS — 기본값 *로 조용히 뜨면 안 된다', () => {
      const { error } = validationSchema.validate({
        DB_PASSWORD: 'a-real-password',
        NODE_ENV: 'production',
      });

      expect(error).toBeDefined();
      expect(error!.details[0].message).toContain('CORS_ORIGINS');
    });

    /**
     * 암호화는 되지만 중간자를 구분할 수 없는 상태로 배포되는 것을 막는다.
     * "작동은 하므로" 리뷰나 모니터링으로 잡히지 않는 종류의 설정이다.
     */
    it('rejects DB_SSL_REJECT_UNAUTHORIZED = false', () => {
      const { error } = validationSchema.validate(
        productionEnv({ DB_SSL_REJECT_UNAUTHORIZED: 'false' }),
      );

      expect(error).toBeDefined();
      expect(error!.details[0].message).toContain('DB_SSL_REJECT_UNAUTHORIZED');
    });

    it('allows DB_SSL_REJECT_UNAUTHORIZED = true', () => {
      const { error } = validationSchema.validate(
        productionEnv({ DB_SSL_REJECT_UNAUTHORIZED: 'true' }),
      );

      expect(error).toBeUndefined();
    });

    it('does not apply the production rules when NODE_ENV is unset', () => {
      const { error } = validationSchema.validate({ CORS_ORIGINS: '*', DB_PASSWORD: '' });

      expect(error).toBeUndefined();
    });
  });

  describe('boolean coercion', () => {
    it.each([
      ['APP_SWAGGER_ENABLED', 'true', true],
      ['APP_SWAGGER_ENABLED', 'false', false],
      ['CORS_ENABLED', 'true', true],
      ['CORS_ENABLED', 'false', false],
      ['CORS_CREDENTIALS', 'true', true],
      ['CORS_CREDENTIALS', 'false', false],
      ['LOG_LOKI_ENABLED', 'true', true],
      ['LOG_LOKI_ENABLED', 'false', false],
      ['LOG_STDOUT_ENABLED', 'true', true],
      ['LOG_STDOUT_ENABLED', 'false', false],
      ['REDIS_ENABLED', 'true', true],
      ['REDIS_ENABLED', 'false', false],
      ['BULLMQ_ENABLED', 'true', true],
      ['BULLMQ_ENABLED', 'false', false],
      ['PROMETHEUS_ENABLED', 'true', true],
      ['PROMETHEUS_ENABLED', 'false', false],
      ['MONGODB_ENABLED', 'true', true],
      ['MONGODB_ENABLED', 'false', false],
      ['DB_LOGGING', 'true', true],
      ['DB_LOGGING', 'false', false],
      ['DB_SSL', 'true', true],
      ['DB_SSL', 'false', false],
    ])('coerces %s = "%s" to %s', (key, input, expected) => {
      const { value, error } = validationSchema.validate({
        [key]: input,
      });

      expect(error).toBeUndefined();
      expect(value[key]).toBe(expected);
    });
  });
});
