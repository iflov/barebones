import { Controller, Get, Version } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  DiskHealthIndicator,
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';

import { isFeatureEnabled } from '../config/redis.config';
import { RedisHealthIndicator } from '../infra/health/redis.health-indicator';

@ApiTags('health')
@Controller('admin/health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
    private readonly disk: DiskHealthIndicator,
    private readonly configService: ConfigService,
    private readonly redis: RedisHealthIndicator,
  ) {}

  @Get()
  @Version('1')
  @SkipThrottle()
  @HealthCheck()
  @ApiOperation({ summary: 'Application health check' })
  @ApiOkResponse({ description: 'Returns application health information' })
  check() {
    const checks = [
      () => this.db.pingCheck('database'),
      () =>
        this.memory.checkHeap(
          'memory_heap',
          this.configService.get<number>('HEALTH_MEMORY_HEAP_THRESHOLD') ?? 512 * 1024 * 1024,
        ),
      () =>
        this.disk.checkStorage('storage', {
          path: process.platform === 'win32' ? 'C:\\' : '/',
          thresholdPercent: 0.95,
        }),
    ];

    if (isFeatureEnabled(this.configService.get<string | boolean>('REDIS_ENABLED'))) {
      checks.push(() => this.redis.isHealthy('redis'));
    }

    return this.health.check(checks);
  }
}
