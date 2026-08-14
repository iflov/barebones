import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MemoryHealthIndicator } from '@nestjs/terminus';

import type {
  HealthIndicatorPort,
  HealthIndicatorSnapshot,
} from '../../application/ports/health-indicator.port';

@Injectable()
export class MemoryHealthAdapter implements HealthIndicatorPort {
  readonly key = 'memory_heap';

  constructor(
    private readonly memory: MemoryHealthIndicator,
    private readonly configService: ConfigService,
  ) {}

  async check(): Promise<HealthIndicatorSnapshot> {
    const threshold =
      this.configService.get<number>('HEALTH_MEMORY_HEAP_THRESHOLD') ?? 512 * 1024 * 1024;
    const result = await this.memory.checkHeap(this.key, threshold);

    return { status: result[this.key]?.status === 'up' ? 'up' : 'down' };
  }
}
