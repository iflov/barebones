import { Module, type Type } from '@nestjs/common';

import { featureFlags } from '../config/feature-flags';
import { RdbDatabaseModule } from '../infra/rdb/rdb-database.module';
import { RedisModule } from '../infra/redis/redis.module';
import { HealthController } from './adapters/in/http/health.controller';
import {
  DISK_SPACE_PROBE,
  DiskHealthAdapter,
  nodeDiskSpaceProbe,
} from './adapters/out/disk-health.adapter';
import {
  MEMORY_USAGE_PROBE,
  MemoryHealthAdapter,
  processMemoryUsageProbe,
} from './adapters/out/memory-health.adapter';
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
  imports: [RdbDatabaseModule, RedisModule],
  exports: [HealthCoordinator, HealthMetricsService],
  providers: [
    { provide: DISK_SPACE_PROBE, useValue: nodeDiskSpaceProbe },
    { provide: MEMORY_USAGE_PROBE, useValue: processMemoryUsageProbe },
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
