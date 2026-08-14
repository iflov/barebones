import { Module, type Type } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { featureFlags } from '../config/feature-flags';
import { RedisModule } from '../infra/redis/redis.module';
import { HealthController } from './adapters/in/http/health.controller';
import { DiskHealthAdapter } from './adapters/out/disk-health.adapter';
import { MemoryHealthAdapter } from './adapters/out/memory-health.adapter';
import { MongodbHealthAdapter } from './adapters/out/mongodb-health.adapter';
import { RdbHealthAdapter } from './adapters/out/rdb-health.adapter';
import { RedisHealthAdapter } from './adapters/out/redis-health.adapter';
import { HealthCoordinator } from './application/health.coordinator';
import {
  HEALTH_INDICATORS,
  type HealthIndicatorPort,
} from './application/ports/health-indicator.port';
import { GetHealthQueryHandler } from './application/queries/get-health.query-handler';
import { HealthMetricsService } from './health-metrics.service';

const healthAdapterTypes: Type<HealthIndicatorPort>[] = [
  RdbHealthAdapter,
  MemoryHealthAdapter,
  DiskHealthAdapter,
  RedisHealthAdapter,
];

if (featureFlags.mongodb) {
  healthAdapterTypes.push(MongodbHealthAdapter);
}

/**
 * System health 헥사고날 모듈.
 *
 * inbound adapter는 QueryBus를 통해 진입하고, Coordinator는 기술별 outbound adapter를
 * 모른 채 `HealthIndicatorPort` 목록만 실행한다. HTTP·CLI·Prometheus가 같은 판단을 공유한다.
 */
@Module({
  controllers: [HealthController],
  imports: [TerminusModule, RedisModule],
  exports: [HealthCoordinator, HealthMetricsService, TerminusModule],
  providers: [
    ...healthAdapterTypes,
    GetHealthQueryHandler,
    HealthCoordinator,
    HealthMetricsService,
    {
      inject: healthAdapterTypes,
      provide: HEALTH_INDICATORS,
      useFactory: (...indicators: HealthIndicatorPort[]): HealthIndicatorPort[] => indicators,
    },
  ],
})
export class HealthModule {}
