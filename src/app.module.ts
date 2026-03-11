import { BullModule } from '@nestjs/bullmq';
import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';

import { AuthModule } from './auth/auth.module';
import { buildCacheOptions } from './config/cache.config';
import { buildTypeOrmOptions } from './config/database.config';
import { validationSchema } from './config/env.validation';
import { buildPinoConfig } from './config/pino.config';
import { buildBullConnectionOptions, isFeatureEnabled } from './config/redis.config';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './infra/metrics/metrics.module';
import { QueueModule } from './infra/queue/queue.module';
import { RedisModule } from './infra/redis/redis.module';
import { UserModule } from './user/user.module';

const redisEnabled = isFeatureEnabled(process.env.REDIS_ENABLED);
const bullmqEnabled = isFeatureEnabled(process.env.BULLMQ_ENABLED);

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      envFilePath: [`.env.${process.env.NODE_ENV ?? 'development'}`, '.env'],
      isGlobal: true,
      validationSchema,
      validationOptions: {
        abortEarly: false,
        allowUnknown: true,
      },
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => buildPinoConfig(configService),
    }),
    CacheModule.registerAsync({
      inject: [ConfigService],
      isGlobal: true,
      useFactory: (configService: ConfigService) => buildCacheOptions(configService),
    }),
    ThrottlerModule.forRootAsync({
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
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => buildTypeOrmOptions(configService),
    }),
    ...(bullmqEnabled
      ? [
          BullModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
              connection: buildBullConnectionOptions(configService),
              prefix: configService.get<string>('BULLMQ_PREFIX') ?? 'barebones',
            }),
          }),
        ]
      : []),
    AuthModule,
    HealthModule,
    MetricsModule,
    RedisModule,
    ...(bullmqEnabled && redisEnabled ? [QueueModule] : []),
    UserModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
