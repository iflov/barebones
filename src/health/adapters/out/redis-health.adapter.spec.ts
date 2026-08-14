import { RedisHealthAdapter } from './redis-health.adapter';

describe('RedisHealthAdapter', () => {
  it('returns up when redis responds with PONG', async () => {
    const redis = { ping: jest.fn().mockResolvedValue('PONG') };
    const adapter = new RedisHealthAdapter(redis as never);

    await expect(adapter.check()).resolves.toEqual({ message: undefined, status: 'up' });
  });

  it('keeps a disabled redis visible as down', async () => {
    const redis = { ping: jest.fn().mockResolvedValue('DISABLED') };
    const adapter = new RedisHealthAdapter(redis as never);

    await expect(adapter.check()).resolves.toEqual({ message: 'DISABLED', status: 'down' });
  });
});
