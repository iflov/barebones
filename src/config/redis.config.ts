import type { ConfigService } from '@nestjs/config';
import type { ConnectionOptions } from 'bullmq';
import type { RedisOptions } from 'ioredis';

export function isFeatureEnabled(value: string | boolean | undefined): boolean {
  return value === true || value === 'true';
}

export function buildRedisUrl(configService: ConfigService): string {
  const password = configService.get<string>('REDIS_PASSWORD');
  const usernameAndPassword =
    password === undefined || password === '' ? '' : `:${encodeURIComponent(password)}@`;
  const host = configService.get<string>('REDIS_HOST') ?? 'localhost';
  const port = configService.get<number>('REDIS_PORT') ?? 6379;
  const db = configService.get<number>('REDIS_DB') ?? 0;

  return `redis://${usernameAndPassword}${host}:${port}/${db}`;
}

export function buildRedisOptions(configService: ConfigService): RedisOptions {
  const password = configService.get<string>('REDIS_PASSWORD');

  return {
    db: configService.get<number>('REDIS_DB') ?? 0,
    enableReadyCheck: false,
    host: configService.get<string>('REDIS_HOST') ?? 'localhost',
    keyPrefix: configService.get<string>('REDIS_KEY_PREFIX') ?? 'app:',
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    password: password === '' ? undefined : password,
    port: configService.get<number>('REDIS_PORT') ?? 6379,
  };
}

/**
 * BullMQ 연결 옵션.
 *
 * `db`를 반드시 함께 넘긴다. Redis 서버 하나 안에는 번호가 붙은 독립 공간이 16개 있고
 * db가 다르면 **같은 서버인데 키가 서로 보이지 않는다.** 빠뜨리면 `REDIS_DB=1`로 바꾸는 순간
 * 세션·캐시는 db 1, 잡은 db 0에 흩어져서 "레디스를 뒤졌는데 잡이 없다"가 된다.
 * 설정에는 `REDIS_DB=1`이라 적혀 있으니 다들 거기만 봐서 원인을 찾기 어렵다.
 *
 * ⚠ **`keyPrefix`는 넘기지 않는다.** BullMQ는 ioredis의 `keyPrefix`를 명시적으로 거부한다
 * (`bullmq/.../redis-connection.js`: `'BullMQ: ioredis does not support ioredis prefixes,
 * use the prefix option instead.'`). 키 이름을 Lua 스크립트가 계산하기 때문에 밖에서 prefix를
 * 붙이면 깨진다. 네임스페이스는 `BullModule`의 `prefix`(`BULLMQ_PREFIX`)가 담당한다.
 */
export function buildBullConnectionOptions(configService: ConfigService): ConnectionOptions {
  const redisOptions = buildRedisOptions(configService);

  return {
    db: redisOptions.db,
    host: redisOptions.host ?? 'localhost',
    password: redisOptions.password,
    port: redisOptions.port ?? 6379,
  };
}
