import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type {
  HealthIndicatorPort,
  HealthIndicatorSnapshot,
} from '../../application/ports/health-indicator.port';

export interface MemoryUsageProbe {
  heapUsed(): number;
}

export const MEMORY_USAGE_PROBE = Symbol('MEMORY_USAGE_PROBE');

export const processMemoryUsageProbe: MemoryUsageProbe = {
  heapUsed: () => process.memoryUsage().heapUsed,
};

@Injectable()
export class MemoryHealthAdapter implements HealthIndicatorPort {
  readonly key = 'memory_heap';

  constructor(
    @Inject(MEMORY_USAGE_PROBE) private readonly memory: MemoryUsageProbe,
    private readonly configService: ConfigService,
  ) {}

  check(): Promise<HealthIndicatorSnapshot> {
    const threshold =
      this.configService.get<number>('HEALTH_MEMORY_HEAP_THRESHOLD') ?? 512 * 1024 * 1024;

    return Promise.resolve({ status: this.memory.heapUsed() <= threshold ? 'up' : 'down' });
  }
}
