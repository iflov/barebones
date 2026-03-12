import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { RedisHealthIndicator } from '../infra/health/redis.health-indicator';
import { RedisModule } from '../infra/redis/redis.module';
import { HealthController } from './health.controller';
import { HealthChecksService } from './health-checks.service';
import { HealthMetricsService } from './health-metrics.service';

@Module({
  controllers: [HealthController],
  imports: [TerminusModule, RedisModule],
  providers: [RedisHealthIndicator, HealthChecksService, HealthMetricsService],
})
export class HealthModule {}
