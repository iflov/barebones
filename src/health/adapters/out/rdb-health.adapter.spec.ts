import { RdbHealthAdapter } from './rdb-health.adapter.js';

describe('RdbHealthAdapter', () => {
  it('reports up after the selected ORM probe succeeds', async () => {
    const probe = { ping: vi.fn().mockResolvedValue(undefined) };
    const adapter = new RdbHealthAdapter(probe);

    await expect(adapter.check()).resolves.toEqual({ status: 'up' });
    expect(probe.ping).toHaveBeenCalledTimes(1);
  });

  it('lets the coordinator translate a probe failure into down', async () => {
    const probe = { ping: vi.fn().mockRejectedValue(new Error('database unavailable')) };
    const adapter = new RdbHealthAdapter(probe);

    await expect(adapter.check()).rejects.toThrow('database unavailable');
  });
});
