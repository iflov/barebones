import type { ConfigService } from '@nestjs/config';

import {
  buildBullConnectionOptions,
  buildRedisOptions,
  buildRedisUrl,
  isFeatureEnabled,
} from './redis.config';

function createConfigService(values: Record<string, unknown>): ConfigService {
  return {
    get: <T>(key: string) => values[key] as T,
  } as ConfigService;
}

describe('isFeatureEnabled', () => {
  it.each([
    [true, true],
    ['true', true],
    [false, false],
    ['false', false],
    [undefined, false],
    ['', false],
    [0, false],
    [1, false],
    ['yes', false],
  ])('(%s) → %s', (input, expected) => {
    expect(isFeatureEnabled(input as string | boolean | undefined)).toBe(expected);
  });
});

describe('buildRedisUrl', () => {
  it('uses default values when nothing is configured', () => {
    const config = createConfigService({});

    expect(buildRedisUrl(config)).toBe('redis://localhost:6379/0');
  });

  it('includes encoded password when set', () => {
    const config = createConfigService({ REDIS_PASSWORD: 's3cret' });

    expect(buildRedisUrl(config)).toBe('redis://:s3cret@localhost:6379/0');
  });

  it('encodes special characters in password', () => {
    const config = createConfigService({ REDIS_PASSWORD: 'p@ss:word' });

    expect(buildRedisUrl(config)).toBe('redis://:p%40ss%3Aword@localhost:6379/0');
  });

  it('omits auth when password is empty string', () => {
    const config = createConfigService({ REDIS_PASSWORD: '' });

    expect(buildRedisUrl(config)).toBe('redis://localhost:6379/0');
  });

  it('applies all custom values', () => {
    const config = createConfigService({
      REDIS_DB: 3,
      REDIS_HOST: 'redis.example.com',
      REDIS_PASSWORD: 'pass',
      REDIS_PORT: 6380,
    });

    expect(buildRedisUrl(config)).toBe('redis://:pass@redis.example.com:6380/3');
  });
});

describe('buildRedisOptions', () => {
  it('returns defaults when nothing is configured', () => {
    const config = createConfigService({});
    const options = buildRedisOptions(config);

    expect(options).toStrictEqual({
      db: 0,
      enableReadyCheck: false,
      host: 'localhost',
      keyPrefix: 'app:',
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      password: undefined,
      port: 6379,
    });
  });

  it('maps all custom values', () => {
    const config = createConfigService({
      REDIS_DB: 2,
      REDIS_HOST: 'redis.example.com',
      REDIS_KEY_PREFIX: 'app:',
      REDIS_PASSWORD: 's3cret',
      REDIS_PORT: 6380,
    });
    const options = buildRedisOptions(config);

    expect(options).toStrictEqual({
      db: 2,
      enableReadyCheck: false,
      host: 'redis.example.com',
      keyPrefix: 'app:',
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      password: 's3cret',
      port: 6380,
    });
  });

  it('converts empty password to undefined', () => {
    const config = createConfigService({ REDIS_PASSWORD: '' });
    const options = buildRedisOptions(config);

    expect(options.password).toBeUndefined();
  });
});

describe('buildBullConnectionOptions', () => {
  it('extracts only host, password, and port from redis options', () => {
    const config = createConfigService({
      REDIS_DB: 5,
      REDIS_HOST: 'bull.example.com',
      REDIS_KEY_PREFIX: 'queue:',
      REDIS_PASSWORD: 'bullpass',
      REDIS_PORT: 6381,
    });
    const options = buildBullConnectionOptions(config);

    expect(options).toStrictEqual({
      host: 'bull.example.com',
      password: 'bullpass',
      port: 6381,
    });
  });

  it('uses defaults when nothing is configured', () => {
    const config = createConfigService({});
    const options = buildBullConnectionOptions(config);

    expect(options).toStrictEqual({
      host: 'localhost',
      password: undefined,
      port: 6379,
    });
  });
});
