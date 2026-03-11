import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import { buildRedisOptions, isFeatureEnabled } from '../../config/redis.config';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis | null;
  private readonly enabled: boolean;

  constructor(private readonly configService: ConfigService) {
    this.enabled = isFeatureEnabled(configService.get<string | boolean>('REDIS_ENABLED'));
    this.client = this.enabled ? new Redis(buildRedisOptions(configService)) : null;
  }

  getClient(): Redis | null {
    return this.client;
  }

  async ping(): Promise<string> {
    if (this.client === null) {
      return 'DISABLED';
    }

    if (this.client.status === 'wait') {
      await this.client.connect();
    }

    return this.client.ping();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client !== null && this.client.status !== 'end') {
      await this.client.quit();
    }
  }
}
