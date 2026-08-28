import type { ConfigService } from '@nestjs/config';
import { CacheableMemory } from 'cacheable';
import type { Keyv as ImportKeyv } from 'keyv' with { 'resolution-mode': 'import' };

import { buildRedisUrl, isFeatureEnabled } from './redis.config';

interface CacheStoreOptions {
  stores: ImportKeyv[];
  ttl: number;
}

export async function buildCacheOptions(configService: ConfigService): Promise<CacheStoreOptions> {
  // NestJS 12의 cache-manager 타입은 Keyv의 ESM export를 기준으로 한다. CJS 정적 import는
  // 별도 nominal type(private field)을 만들므로, 런타임도 import export를 사용해 타입과 맞춘다.
  const [{ createKeyv }, { Keyv }] = await Promise.all([import('@keyv/redis'), import('keyv')]);
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
        namespace: configService.get<string>('REDIS_KEY_PREFIX') ?? 'app:',
      }),
    );
  }

  return {
    stores,
    ttl,
  };
}
