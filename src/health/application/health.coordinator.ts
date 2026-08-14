import { Inject, Injectable } from '@nestjs/common';

import {
  HEALTH_INDICATORS,
  type HealthIndicatorPort,
  type HealthIndicatorSnapshot,
  type SystemHealth,
} from './ports/health-indicator.port';

/** HTTP, CLI, Prometheus가 공통으로 사용하는 health 조율자. */
@Injectable()
export class HealthCoordinator {
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
