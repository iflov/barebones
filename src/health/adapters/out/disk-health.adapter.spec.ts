import { Test } from '@nestjs/testing';

import { DISK_SPACE_PROBE, DiskHealthAdapter, type DiskSpaceProbe } from './disk-health.adapter.js';

describe('DiskHealthAdapter', () => {
  it('reports up at exactly 95% used space using user-available blocks', async () => {
    const probe: DiskSpaceProbe = {
      statfs: () => Promise.resolve({ bavail: 50, bfree: 0, blocks: 1_000, bsize: 1 }),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [DiskHealthAdapter, { provide: DISK_SPACE_PROBE, useValue: probe }],
    }).compile();

    await expect(moduleRef.get(DiskHealthAdapter).check()).resolves.toEqual({ status: 'up' });
  });

  it('reports down above 95% used space using user-available blocks', async () => {
    const probe: DiskSpaceProbe = {
      statfs: () => Promise.resolve({ bavail: 49, bfree: 100, blocks: 1_000, bsize: 1 }),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [DiskHealthAdapter, { provide: DISK_SPACE_PROBE, useValue: probe }],
    }).compile();

    await expect(moduleRef.get(DiskHealthAdapter).check()).resolves.toEqual({ status: 'down' });
  });

  it.each([
    { bavail: 0, bfree: 0, blocks: 0, bsize: 1 },
    { bavail: 0, bfree: 0, blocks: Number.POSITIVE_INFINITY, bsize: 1 },
  ])('reports down when total space is invalid', async (snapshot) => {
    const probe: DiskSpaceProbe = { statfs: () => Promise.resolve(snapshot) };
    const moduleRef = await Test.createTestingModule({
      providers: [DiskHealthAdapter, { provide: DISK_SPACE_PROBE, useValue: probe }],
    }).compile();

    await expect(moduleRef.get(DiskHealthAdapter).check()).resolves.toEqual({ status: 'down' });
  });
});
