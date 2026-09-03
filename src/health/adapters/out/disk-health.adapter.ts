import { statfs } from 'node:fs/promises';

import { Inject, Injectable } from '@nestjs/common';

import type { HealthIndicatorPort } from '../../application/ports/out/health-indicator.port.js';
import type { HealthIndicatorSnapshot } from '../../domain/system-health.js';

export interface DiskSpaceSnapshot {
  readonly bavail: number;
  readonly bfree: number;
  readonly blocks: number;
  readonly bsize: number;
}

export interface DiskSpaceProbe {
  statfs(path: string): Promise<DiskSpaceSnapshot>;
}

export const DISK_SPACE_PROBE = Symbol('DISK_SPACE_PROBE');

export const nodeDiskSpaceProbe: DiskSpaceProbe = {
  statfs,
};

@Injectable()
export class DiskHealthAdapter implements HealthIndicatorPort {
  readonly key = 'storage';

  constructor(@Inject(DISK_SPACE_PROBE) private readonly disk: DiskSpaceProbe) {}

  async check(): Promise<HealthIndicatorSnapshot> {
    const path = process.platform === 'win32' ? 'C:\\' : '/';
    const { bavail, blocks, bsize } = await this.disk.statfs(path);
    const total = blocks * bsize;
    const available = bavail * bsize;

    if (total <= 0 || !Number.isFinite(total) || !Number.isFinite(available)) {
      return { status: 'down' };
    }

    const usedRatio = (total - available) / total;

    return { status: usedRatio <= 0.95 ? 'up' : 'down' };
  }
}
