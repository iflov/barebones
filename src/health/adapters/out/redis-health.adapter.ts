import { Injectable } from '@nestjs/common';

import { RedisService } from '../../../infra/redis/redis.service.js';
import type { HealthIndicatorPort } from '../../application/ports/out/health-indicator.port.js';
import type { HealthIndicatorSnapshot } from '../../domain/system-health.js';

@Injectable()
export class RedisHealthAdapter implements HealthIndicatorPort {
  readonly key = 'redis';

  constructor(private readonly redis: RedisService) {}

  async check(): Promise<HealthIndicatorSnapshot> {
    const response = await this.redis.ping();

    return {
      message: response === 'PONG' ? undefined : response,
      status: response === 'PONG' ? 'up' : 'down',
    };
  }
}
