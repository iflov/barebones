import { Injectable } from '@nestjs/common';

import { RedisService } from '../../../infra/redis/redis.service';
import type {
  HealthIndicatorPort,
  HealthIndicatorSnapshot,
} from '../../application/ports/health-indicator.port';

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
