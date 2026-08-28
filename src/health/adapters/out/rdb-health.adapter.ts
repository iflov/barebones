import { Inject, Injectable } from '@nestjs/common';

import {
  RDB_HEALTH_PROBE,
  type RdbHealthProbePort,
} from '../../../common/persistence/rdb-health-probe.port.js';
import type {
  HealthIndicatorPort,
  HealthIndicatorSnapshot,
} from '../../application/ports/health-indicator.port.js';

@Injectable()
export class RdbHealthAdapter implements HealthIndicatorPort {
  readonly key = 'database';

  constructor(@Inject(RDB_HEALTH_PROBE) private readonly database: RdbHealthProbePort) {}

  async check(): Promise<HealthIndicatorSnapshot> {
    await this.database.ping();
    return { status: 'up' };
  }
}
