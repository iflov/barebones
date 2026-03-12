import { createKeyv } from '@keyv/redis';
import type { ConfigService } from '@nestjs/config';
import { CacheableMemory } from 'cacheable';
import { Keyv } from 'keyv';

import { buildRedisUrl, isFeatureEnabled } from './redis.config';

interface CacheStoreOptions {
  stores: Keyv[];
  ttl: number;
}

export function buildCacheOptions(configService: ConfigService): CacheStoreOptions {
  const ttl = configService.get<number>('CACHE_TTL') ?? 60_000;
  const stores = [
    new Keyv({
      store: new CacheableMemory({
        lruSize: 5_000,
        ttl,
      }),
    }),
  ];

  if (isFeatureEnabled(configService.get<string | boolean>('REDIS_ENABLED'))) {
    stores.push(
      createKeyv(buildRedisUrl(configService), {
        namespace: configService.get<string>('REDIS_KEY_PREFIX') ?? 'admin:',
      }),
    );
  }

  return {
    stores,
    ttl,
  };
}
