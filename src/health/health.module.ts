import { Module, type Type } from '@nestjs/common';

import { featureFlags } from '../config/feature-flags.js';
import { RdbDatabaseModule } from '../infra/rdb/rdb-database.module.js';
import { RedisModule } from '../infra/redis/redis.module.js';
import { HealthController } from './adapters/in/http/health.controller.js';
import {
  DISK_SPACE_PROBE,
  DiskHealthAdapter,
  nodeDiskSpaceProbe,
} from './adapters/out/disk-health.adapter.js';
import {
  MEMORY_USAGE_PROBE,
  MemoryHealthAdapter,
  processMemoryUsageProbe,
} from './adapters/out/memory-health.adapter.js';
import { MongodbHealthAdapter } from './adapters/out/mongodb-health.adapter.js';
import { RdbHealthAdapter } from './adapters/out/rdb-health.adapter.js';
import { RedisHealthAdapter } from './adapters/out/redis-health.adapter.js';
import { HealthCoordinator } from './application/health.coordinator.js';
import { HEALTH } from './application/ports/in/health.port.js';
import {
  HEALTH_INDICATORS,
  type HealthIndicatorPort,
} from './application/ports/out/health-indicator.port.js';
import { HealthMetricsService } from './health-metrics.service.js';

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
 * System health capability의 composition root — 두 방향의 port에 구현을 묶는 유일한 지점.
 *
 * inbound adapter는 `HEALTH` 토큰으로 진입하고, Coordinator는 기술별 outbound adapter를
 * 모른 채 `HealthIndicatorPort` 목록만 실행한다. HTTP·Prometheus가 같은 판단을 공유한다.
 *
 * `exports`에는 `HEALTH` 토큰 하나만 있다. 소비자는 `@Inject(HEALTH)`로 받고 타입은
 * `import type`으로 보므로 구현 클래스가 소비자의 런타임 import 그래프에 들어가지 않는다.
 * `HealthMetricsService`도 나가지 않는다 — 그것은 `MetricsService`의 registry에 gauge를 붙이는
 * 이 capability의 inbound infrastructure adapter이고, 밖에서 주입받을 것이 아니다.
 */
@Module({
  controllers: [HealthController],
  imports: [RdbDatabaseModule, RedisModule],
  exports: [HEALTH],
  providers: [
    { provide: DISK_SPACE_PROBE, useValue: nodeDiskSpaceProbe },
    { provide: MEMORY_USAGE_PROBE, useValue: processMemoryUsageProbe },
    ...healthAdapterTypes,
    { provide: HEALTH, useClass: HealthCoordinator },
    HealthMetricsService,
    {
      inject: healthAdapterTypes,
      provide: HEALTH_INDICATORS,
      useFactory: (...indicators: HealthIndicatorPort[]): HealthIndicatorPort[] => indicators,
    },
  ],
})
export class HealthModule {}
