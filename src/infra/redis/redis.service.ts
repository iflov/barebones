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
    const client = await this.getConnectedClientOrNull();

    if (client === null) {
      return 'DISABLED';
    }

    return client.ping();
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<'OK'> {
    const client = await this.getRequiredConnectedClient();

    if (ttlSeconds === undefined) {
      return client.set(key, value);
    }

    return client.set(key, value, 'EX', ttlSeconds);
  }

  async get(key: string): Promise<string | null> {
    const client = await this.getRequiredConnectedClient();
    return client.get(key);
  }

  async del(...keys: string[]): Promise<number> {
    if (keys.length === 0) {
      return 0;
    }

    const client = await this.getRequiredConnectedClient();
    return client.del(...keys);
  }

  async delByPrefix(prefix: string): Promise<number> {
    const client = await this.getRequiredConnectedClient();
    let cursor = '0';
    let deleted = 0;

    do {
      const [nextCursor, keys] = await client.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 100);
      cursor = nextCursor;

      if (keys.length > 0) {
        deleted += await client.del(...keys);
      }
    } while (cursor !== '0');

    return deleted;
  }

  async sAdd(key: string, ...members: string[]): Promise<number> {
    if (members.length === 0) {
      return 0;
    }

    const client = await this.getRequiredConnectedClient();
    return client.sadd(key, ...members);
  }

  async sMembers(key: string): Promise<string[]> {
    const client = await this.getRequiredConnectedClient();
    return client.smembers(key);
  }

  async sRem(key: string, ...members: string[]): Promise<number> {
    if (members.length === 0) {
      return 0;
    }

    const client = await this.getRequiredConnectedClient();
    return client.srem(key, ...members);
  }

  async expire(key: string, ttlSeconds: number): Promise<number> {
    const client = await this.getRequiredConnectedClient();
    return client.expire(key, ttlSeconds);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client !== null && this.client.status !== 'end') {
      await this.client.quit();
    }
  }

  private async getConnectedClientOrNull(): Promise<Redis | null> {
    if (this.client === null) {
      return null;
    }

    if (this.client.status === 'wait') {
      await this.client.connect();
    }

    return this.client;
  }

  private async getRequiredConnectedClient(): Promise<Redis> {
    const client = await this.getConnectedClientOrNull();

    if (client === null) {
      throw new Error('Redis is disabled. Set REDIS_ENABLED=true to use Redis-backed features.');
    }

    return client;
  }
}
