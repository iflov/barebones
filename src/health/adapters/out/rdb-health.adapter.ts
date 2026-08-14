import { Injectable } from '@nestjs/common';
import { TypeOrmHealthIndicator } from '@nestjs/terminus';

import type {
  HealthIndicatorPort,
  HealthIndicatorSnapshot,
} from '../../application/ports/health-indicator.port';

@Injectable()
export class RdbHealthAdapter implements HealthIndicatorPort {
  readonly key = 'database';

  constructor(private readonly database: TypeOrmHealthIndicator) {}

  async check(): Promise<HealthIndicatorSnapshot> {
    const result = await this.database.pingCheck(this.key);
    return { status: result[this.key]?.status === 'up' ? 'up' : 'down' };
  }
}
