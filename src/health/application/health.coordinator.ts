import { Inject, Injectable } from '@nestjs/common';

import type { HealthIndicatorSnapshot, SystemHealth } from '../domain/system-health.js';
import type { HealthPort } from './ports/in/health.port.js';
import { HEALTH_INDICATORS, type HealthIndicatorPort } from './ports/out/health-indicator.port.js';

/**
 * inbound port `HealthPort`의 구현. HTTP와 Prometheus가 같은 판정을 공유하므로 coordinator다.
 *
 * module `exports`에 실리지 않는다 — 밖으로 나가는 것은 `HEALTH` 토큰 하나다.
 */
@Injectable()
export class HealthCoordinator implements HealthPort {
  constructor(
    @Inject(HEALTH_INDICATORS) private readonly indicators: readonly HealthIndicatorPort[],
  ) {}

  async check(): Promise<SystemHealth> {
    const snapshots: Record<string, HealthIndicatorSnapshot> = {};

    await Promise.all(
      this.indicators.map(async (indicator) => {
        snapshots[indicator.key] = await this.checkIndicator(indicator);
      }),
    );

    const status = Object.values(snapshots).every((snapshot) => snapshot.status === 'up')
      ? 'up'
      : 'down';

    return { indicators: snapshots, status };
  }

  async inspectIndicators(): Promise<Record<string, number>> {
    const health = await this.check();
    const statusByIndicator: Record<string, number> = {};

    for (const [key, snapshot] of Object.entries(health.indicators)) {
      statusByIndicator[key] = snapshot.status === 'up' ? 1 : 0;
    }

    return statusByIndicator;
  }

  private async checkIndicator(indicator: HealthIndicatorPort): Promise<HealthIndicatorSnapshot> {
    try {
      return await indicator.check();
    } catch (error) {
      return {
        message: error instanceof Error ? error.message : 'Health check failed',
        status: 'down',
      };
    }
  }
}
