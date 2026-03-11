import { Injectable } from '@nestjs/common';
import { HealthCheckError, type HealthIndicatorResult } from '@nestjs/terminus';

import { RedisService } from '../redis/redis.service';

@Injectable()
export class RedisHealthIndicator {
  constructor(private readonly redisService: RedisService) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const response = await this.redisService.ping();

    if (response !== 'PONG') {
      throw new HealthCheckError('Redis health check failed', {
        [key]: {
          message: response,
          status: 'down',
        },
      });
    }

    return {
      [key]: {
        status: 'up',
      },
    };
  }
}
