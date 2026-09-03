import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';

import { LoggingInterceptor } from './common/interceptors/logger.interceptor.js';
import { buildCacheOptions } from './config/cache.config.js';
import { validationSchema } from './config/env.validation.js';
import { featureFlags } from './config/feature-flags.js';
import { envFilePaths } from './config/load-env.js';
import { buildPinoConfig } from './config/pino.config.js';
import { HealthModule } from './health/health.module.js';
import { MetricsModule } from './infra/metrics/metrics.module.js';
import { MongoDatabaseModule } from './infra/mongodb/mongodb.module.js';
import { QueueModule } from './infra/queue/queue.module.js';
import { RdbDatabaseModule } from './infra/rdb/rdb-database.module.js';
import { RedisModule } from './infra/redis/redis.module.js';

// ⚠ 이 플래그들은 DI 컨테이너 이전에 결정된다 (constitution A-3 예외 1).
// `.env` 파일 값을 보려면 main.ts가 './config/load-env'를 먼저 import해야 한다 —
// 그러지 않으면 모듈이 조용히 빠진 채로 앱이 정상 부팅한다. 근거는 load-env.ts 참고.
const {
  bullmq: bullmqEnabled,
  metrics: metricsEnabled,
  mongodb: mongodbEnabled,
  redis: redisEnabled,
} = featureFlags;

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      // load-env.ts와 같은 목록·같은 순서를 쓴다. 갈라지면 "부팅은 됐는데 플래그만 다른" 상태가 된다.
      envFilePath: envFilePaths(),
      isGlobal: true,
      validationSchema,
      validationOptions: {
        libraryOptions: {
          abortEarly: false,
          allowUnknown: true,
        },
      },
    }),
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      providers: [],
      useFactory: (configService: ConfigService) => buildPinoConfig(configService),
    }),
    CacheModule.registerAsync({
      inject: [ConfigService],
      isGlobal: true,
      useFactory: (configService: ConfigService) => buildCacheOptions(configService),
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            limit: configService.get<number>('THROTTLE_LIMIT') ?? 100,
            ttl: configService.get<number>('THROTTLE_TTL') ?? 60_000,
          },
        ],
      }),
    }),
    RdbDatabaseModule,
    ...(mongodbEnabled ? [MongoDatabaseModule] : []),
    HealthModule,
    ...(metricsEnabled ? [MetricsModule] : []),
    RedisModule,
    ...(bullmqEnabled && redisEnabled ? [QueueModule] : []),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule {}
