import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import mongoose, { type Connection } from 'mongoose';

import type { HealthIndicatorPort } from '../../application/ports/out/health-indicator.port.js';
import type { HealthIndicatorSnapshot } from '../../domain/system-health.js';

@Injectable()
export class MongodbHealthAdapter implements HealthIndicatorPort {
  readonly key = 'mongodb';

  constructor(@InjectConnection() private readonly connection: Connection) {}

  async check(): Promise<HealthIndicatorSnapshot> {
    if (this.connection.readyState !== mongoose.ConnectionStates.connected) {
      return { message: `readyState=${this.connection.readyState}`, status: 'down' };
    }

    if (this.connection.db === undefined) {
      return { message: 'MongoDB connection has no database handle', status: 'down' };
    }

    const response = await this.connection.db.admin().ping();
    return { status: response.ok === 1 ? 'up' : 'down' };
  }
}
