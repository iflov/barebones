import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import {
  MEMORY_USAGE_PROBE,
  MemoryHealthAdapter,
  type MemoryUsageProbe,
} from './memory-health.adapter';

describe('MemoryHealthAdapter', () => {
  it('reports up when heap usage equals the configured threshold', async () => {
    const probe: MemoryUsageProbe = { heapUsed: () => 512 };
    const config = { get: () => 512 };
    const moduleRef = await Test.createTestingModule({
      providers: [
        MemoryHealthAdapter,
        { provide: MEMORY_USAGE_PROBE, useValue: probe },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    await expect(moduleRef.get(MemoryHealthAdapter).check()).resolves.toEqual({ status: 'up' });
  });

  it('reports down when heap usage exceeds the configured threshold', async () => {
    const probe: MemoryUsageProbe = { heapUsed: () => 513 };
    const config = { get: () => 512 };
    const moduleRef = await Test.createTestingModule({
      providers: [
        MemoryHealthAdapter,
        { provide: MEMORY_USAGE_PROBE, useValue: probe },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    await expect(moduleRef.get(MemoryHealthAdapter).check()).resolves.toEqual({ status: 'down' });
  });
});
