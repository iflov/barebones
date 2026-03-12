import { validationSchema } from './env.validation';

describe('validationSchema', () => {
  describe('defaults', () => {
    it('fills all defaults when no values are provided', () => {
      const { value, error } = validationSchema.validate({});

      expect(error).toBeUndefined();
      expect(value.NODE_ENV).toBe('development');
      expect(value.APP_NAME).toBe('admin');
      expect(value.APP_PORT).toBe(3000);
      expect(value.APP_SWAGGER_PATH).toBe('admin/docs');
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
      expect(value.REDIS_KEY_PREFIX).toBe('admin:');
      expect(value.CACHE_TTL).toBe(60_000);
      expect(value.BULLMQ_ENABLED).toBe(true);
      expect(value.BULLMQ_PREFIX).toBe('admin');
      expect(value.PROMETHEUS_ENABLED).toBe(true);
      expect(value.PROMETHEUS_PATH).toBe('admin/metrics');
      expect(value.PROMETHEUS_METRIC_PREFIX).toBe('admin_');
      expect(value.PROMETHEUS_HOST_PORT).toBe(9090);
      expect(value.DB_TYPE).toBe('mariadb');
      expect(value.DB_HOST).toBe('localhost');
      expect(value.DOCKER_DB_HOST).toBe('mariadb');
      expect(value.DB_PORT).toBe(3306);
      expect(value.MARIADB_HOST_PORT).toBe(3306);
      expect(value.DB_USERNAME).toBe('admin');
      expect(value.DB_PASSWORD).toBe('admin');
      expect(value.DB_DATABASE).toBe('admin');
      expect(value.DB_LOGGING).toBe(false);
      expect(value.GRAFANA_HOST_PORT).toBe(3001);
    });
  });

  describe('valid inputs', () => {
    it('accepts fully customized values', () => {
      const input = {
        NODE_ENV: 'production',
        APP_NAME: 'my-app',
        APP_PORT: 8080,
        APP_SWAGGER_PATH: 'api/docs',
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
        PROMETHEUS_PATH: 'api/metrics',
        PROMETHEUS_METRIC_PREFIX: 'myapp_',
        PROMETHEUS_HOST_PORT: 9091,
        DB_TYPE: 'sqljs',
        DB_HOST: 'db.example.com',
        DOCKER_DB_HOST: 'my-mariadb',
        DB_PORT: 3307,
        MARIADB_HOST_PORT: 3307,
        DB_USERNAME: 'root',
        DB_PASSWORD: 'rootpass',
        MARIADB_ROOT_PASSWORD: 'rootpass',
        DB_DATABASE: 'mydb',
        DB_LOGGING: true,
        GRAFANA_HOST_PORT: 3002,
        GRAFANA_ADMIN_USER: 'admin',
        GRAFANA_ADMIN_PASSWORD: 'grafana-secret',
      };

      const { value, error } = validationSchema.validate(input);

      expect(error).toBeUndefined();
      expect(value.NODE_ENV).toBe('production');
      expect(value.APP_PORT).toBe(8080);
      expect(value.DB_TYPE).toBe('sqljs');
    });
  });

  describe('invalid inputs', () => {
    it.each([
      ['NODE_ENV', 'staging', '"NODE_ENV" must be one of'],
      ['APP_PORT', 99999, '"APP_PORT" must be a valid port'],
      ['APP_PORT', -1, '"APP_PORT" must be a valid port'],
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
      ['DB_TYPE', 'postgres', '"DB_TYPE" must be one of'],
      ['DB_HOST', '!!!invalid', '"DB_HOST" must be a valid hostname'],
      ['DOCKER_DB_HOST', '!!!invalid', '"DOCKER_DB_HOST" must be a valid hostname'],
      ['DB_PORT', 99999, '"DB_PORT" must be a valid port'],
      ['MARIADB_HOST_PORT', 99999, '"MARIADB_HOST_PORT" must be a valid port'],
      ['GRAFANA_HOST_PORT', 99999, '"GRAFANA_HOST_PORT" must be a valid port'],
    ])('rejects %s = %s', (key, input, expectedMessage) => {
      const { error } = validationSchema.validate({ [key]: input });

      expect(error).toBeDefined();
      expect(error!.details[0].message).toContain(expectedMessage);
    });
  });

  describe('boolean coercion', () => {
    it.each([
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
      ['DB_LOGGING', 'true', true],
      ['DB_LOGGING', 'false', false],
    ])('coerces %s = "%s" to %s', (key, input, expected) => {
      const { value, error } = validationSchema.validate({ [key]: input });

      expect(error).toBeUndefined();
      expect(value[key]).toBe(expected);
    });
  });
});
