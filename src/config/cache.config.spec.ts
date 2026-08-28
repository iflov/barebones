import type { ConfigService } from '@nestjs/config';

import { buildCacheOptions } from './cache.config.js';

function createConfigService(values: Record<string, unknown>): ConfigService {
  return {
    get: <T>(key: string) => values[key] as T,
  } as ConfigService;
}

describe('buildCacheOptions', () => {
  it('builds an in-memory cache by default', async () => {
    const config = createConfigService({});
    const options = await buildCacheOptions(config);

    const memoryStore = options.stores[0]?.opts.store as unknown as {
      _lruSize: number;
      _ttl: number;
      constructor: { name: string };
    };

    expect(options.ttl).toBe(60_000);
    expect(options.stores).toHaveLength(1);
    expect(memoryStore.constructor.name).toBe('CacheableMemory');
    expect(memoryStore._lruSize).toBe(5_000);
    expect(memoryStore._ttl).toBe(60_000);
  });

  it('adds a Redis-backed cache store when Redis is enabled', async () => {
    const config = createConfigService({
      CACHE_TTL: 15_000,
      REDIS_DB: 2,
      REDIS_ENABLED: 'true',
      REDIS_HOST: 'redis.example.com',
      REDIS_KEY_PREFIX: 'cache:',
      REDIS_PASSWORD: 'p@ss',
      REDIS_PORT: 6380,
    });

    const options = await buildCacheOptions(config);
    const redisStore = options.stores[1] as unknown as {
      _namespace: string;
      _store: {
        _client: {
          options: {
            url: string;
          };
        };
      };
    };

    expect(options.ttl).toBe(15_000);
    expect(options.stores).toHaveLength(2);
    expect(redisStore._namespace).toBe('cache:');
    expect(redisStore._store._client.options.url).toBe('redis://:p%40ss@redis.example.com:6380/2');
  });
});
