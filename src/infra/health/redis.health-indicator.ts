import { Injectable } from '@nestjs/common';
import { type HealthIndicatorResult, HealthIndicatorService } from '@nestjs/terminus';

import { RedisService } from '../redis/redis.service';

/**
 * Redis 헬스체크 구현체
 *
 * Redis에 PING 명령을 보내고 PONG 응답 여부로 상태를 판단.
 *
 * 호출 경로 (2가지):
 *   1. GET /v1/<preset-health-path> → terminus → HealthChecksService.getChecks() → isHealthy()
 *   2. GET /v1/<preset-metrics-path> → collect 콜백 → HealthChecksService.inspectIndicators() → isHealthy()
 *
 * 반환값 예시:
 *   up:   { redis: { status: 'up' } }
 *   down: { redis: { status: 'down', message: 'Connection refused' } }
 */
@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly redisService: RedisService,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const check = this.healthIndicatorService.check(key);
    const response = await this.redisService.ping();

    if (response !== 'PONG') {
      return check.down(response);
    }

    return check.up();
  }
}
