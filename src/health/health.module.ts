import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { RedisHealthIndicator } from '../infra/health/redis.health-indicator';
import { RedisModule } from '../infra/redis/redis.module';
import { HealthController } from './health.controller';
import { HealthChecksService } from './health-checks.service';
import { HealthMetricsService } from './health-metrics.service';

/**
 * 헬스체크 모듈
 *
 * 구성:
 *   - HealthChecksService: 헬스체크 항목의 단일 소스 (DB, 메모리, 디스크, Redis)
 *   - preset health controllers: preset-owned health route에 JSON 응답 제공
 *   - HealthMetricsService: Prometheus Gauge로 헬스 상태 노출 (metrics surface에 포함)
 *   - RedisHealthIndicator: Redis PING 체크 구현체
 *
 * MetricsService는 MetricsModule이 @Global()이라 import 없이 주입 가능
 */
@Module({
  controllers: [HealthController],
  imports: [TerminusModule, RedisModule],
  exports: [HealthChecksService, HealthMetricsService, TerminusModule],
  providers: [RedisHealthIndicator, HealthChecksService, HealthMetricsService],
})
export class HealthModule {}
