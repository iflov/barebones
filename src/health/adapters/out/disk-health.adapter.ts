import { Injectable } from '@nestjs/common';
import { DiskHealthIndicator } from '@nestjs/terminus';

import type {
  HealthIndicatorPort,
  HealthIndicatorSnapshot,
} from '../../application/ports/health-indicator.port';

@Injectable()
export class DiskHealthAdapter implements HealthIndicatorPort {
  readonly key = 'storage';

  constructor(private readonly disk: DiskHealthIndicator) {}

  async check(): Promise<HealthIndicatorSnapshot> {
    const result = await this.disk.checkStorage(this.key, {
      path: process.platform === 'win32' ? 'C:\\' : '/',
      thresholdPercent: 0.95,
    });

    return { status: result[this.key]?.status === 'up' ? 'up' : 'down' };
  }
}
