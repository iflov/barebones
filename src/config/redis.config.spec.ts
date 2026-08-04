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
  /**
   * `db`가 반드시 포함돼야 한다.
   *
   * 예전 이 테스트는 `'extracts only host, password, and port'`라는 이름으로 **버그를
   * 명세로 못박고 있었다.** db를 빠뜨리면 `REDIS_DB=1`로 바꾸는 순간 세션·캐시는 db 1,
   * 잡은 db 0으로 흩어지고 — 서버는 하나인데 키가 서로 보이지 않으므로 —
   * "레디스를 뒤졌는데 잡이 없다"가 된다. 설정 파일에는 `REDIS_DB=1`이라 적혀 있어서
   * 다들 거기만 보고 원인을 못 찾는다.
   */
  it('db를 함께 넘긴다', () => {
    const config = createConfigService({
      REDIS_DB: 5,
      REDIS_HOST: 'bull.example.com',
      REDIS_KEY_PREFIX: 'queue:',
      REDIS_PASSWORD: 'bullpass',
      REDIS_PORT: 6381,
    });
    const options = buildBullConnectionOptions(config);

    expect(options).toStrictEqual({
      db: 5,
      host: 'bull.example.com',
      password: 'bullpass',
      port: 6381,
    });
  });

  /**
   * ⚠ `keyPrefix`는 **넘기면 안 된다.** BullMQ가 ioredis의 keyPrefix를 명시적으로 거부한다
   * ('BullMQ: ioredis does not support ioredis prefixes, use the prefix option instead.').
   * 키 이름을 Lua 스크립트가 계산하기 때문이다. 네임스페이스는 BullModule의 `prefix`가 담당한다.
   */
  it('keyPrefix는 넘기지 않는다 — BullMQ가 거부한다', () => {
    const options = buildBullConnectionOptions(createConfigService({ REDIS_KEY_PREFIX: 'queue:' }));

    expect(options).not.toHaveProperty('keyPrefix');
  });

  it('uses defaults when nothing is configured', () => {
    const config = createConfigService({});
    const options = buildBullConnectionOptions(config);

    expect(options).toStrictEqual({
      db: 0,
      host: 'localhost',
      password: undefined,
      port: 6379,
    });
  });
});
