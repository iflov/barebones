import { Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

import { buildRedisOptions, isFeatureEnabled } from '../../config/redis.config.js';

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

  // delByPrefix()는 제거했다. **조용히 실패하는 API였기 때문이다.**
  //
  // ioredis의 `keyPrefix`는 키 인자에는 붙지만 SCAN의 MATCH 패턴에는 붙지 않는다:
  //   SCAN 0 MATCH 'cache:*'  →  실제 키는 'app:cache:...'이므로 0개 발견
  //   DEL  'app:cache:x'      →  'app:app:cache:x'로 또 붙어서 0개 삭제
  // 즉 무엇을 넘겨도 결과가 0인데 **에러는 안 난다.** 나중에 누가 "있으니까 쓰겠지" 하고
  // 로그아웃이나 캐시 무효화에 쓰면 "지웠다고 생각했는데 살아 있는" 상태가 된다.
  //
  // prefix 삭제가 정말 필요해지면 그때 **테스트와 함께** 다시 만든다. 그때도 SCAN은
  // 실제 키에 붙는 prefix를 포함한 패턴으로 만들고, 삭제는 prefix를 뗀 키로 해야 한다.

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

  /**
   * Redis를 전제하는 기능에서 쓰는 접근자.
   *
   * 일반 `Error`가 아니라 `ServiceUnavailableException`(503)을 던진다.
   * `AllExceptionsFilter`는 `HttpException`이 아닌 예외를 전부 500으로 만드는데,
   * 500은 "코드에 버그가 있다"는 신호라 **의존 서비스 부재를 서버 버그로 오인하게 된다.**
   * 503이면 호출부·모니터링·재시도 정책이 "일시적 의존성 문제"로 다룰 수 있다.
   */
  private async getRequiredConnectedClient(): Promise<Redis> {
    const client = await this.getConnectedClientOrNull();

    if (client === null) {
      throw new ServiceUnavailableException(
        'Redis is disabled. Set REDIS_ENABLED=true to use Redis-backed features.',
      );
    }

    return client;
  }
}
