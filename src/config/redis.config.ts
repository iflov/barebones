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
    keyPrefix: configService.get<string>('REDIS_KEY_PREFIX') ?? 'barebones:',
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    password: password === '' ? undefined : password,
    port: configService.get<number>('REDIS_PORT') ?? 6379,
  };
}

export function buildBullConnectionOptions(configService: ConfigService): ConnectionOptions {
  const redisOptions = buildRedisOptions(configService);

  return {
    host: redisOptions.host ?? 'localhost',
    password: redisOptions.password,
    port: redisOptions.port ?? 6379,
  };
}
