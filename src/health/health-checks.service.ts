import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DiskHealthIndicator,
  type HealthIndicatorFunction,
  MemoryHealthIndicator,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';

import { isFeatureEnabled } from '../config/redis.config';
import { RedisHealthIndicator } from '../infra/health/redis.health-indicator';

interface NamedHealthIndicatorCheck {
  key: string;
  run: HealthIndicatorFunction;
}

@Injectable()
export class HealthChecksService {
  constructor(
    private readonly db: TypeOrmHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
    private readonly disk: DiskHealthIndicator,
    private readonly configService: ConfigService,
    private readonly redis: RedisHealthIndicator,
  ) {}

  private getNamedChecks(): NamedHealthIndicatorCheck[] {
    const checks: NamedHealthIndicatorCheck[] = [
      {
        key: 'database',
        run: () => this.db.pingCheck('database'),
      },
      {
        key: 'memory_heap',
        run: () =>
          this.memory.checkHeap(
            'memory_heap',
            this.configService.get<number>('HEALTH_MEMORY_HEAP_THRESHOLD') ?? 512 * 1024 * 1024,
          ),
      },
      {
        key: 'storage',
        run: () =>
          this.disk.checkStorage('storage', {
            path: process.platform === 'win32' ? 'C:\\' : '/',
            thresholdPercent: 0.95,
          }),
      },
    ];

    if (isFeatureEnabled(this.configService.get<string | boolean>('REDIS_ENABLED'))) {
      checks.push({
        key: 'redis',
        run: () => this.redis.isHealthy('redis'),
      });
    }

    return checks;
  }

  getChecks(): HealthIndicatorFunction[] {
    return this.getNamedChecks().map((check) => check.run);
  }

  async inspectIndicators(): Promise<Record<string, number>> {
    const statusByIndicator: Record<string, number> = {};

    for (const check of this.getNamedChecks()) {
      try {
        const result = await check.run();
        const detail = result[check.key];

        statusByIndicator[check.key] = detail?.status === 'up' ? 1 : 0;
      } catch {
        statusByIndicator[check.key] = this.mapIndicatorErrorToGauge();
      }
    }

    return statusByIndicator;
  }

  private mapIndicatorErrorToGauge(): number {
    return 0;
  }
}
