import { MongodbHealthAdapter } from './mongodb-health.adapter';

describe('MongodbHealthAdapter', () => {
  it('pings the selected database when connected', async () => {
    const ping = jest.fn().mockResolvedValue({ ok: 1 });
    const connection = { db: { admin: () => ({ ping }) }, readyState: 1 };
    const adapter = new MongodbHealthAdapter(connection as never);

    await expect(adapter.check()).resolves.toEqual({ status: 'up' });
    expect(ping).toHaveBeenCalledTimes(1);
  });

  it('reports a disconnected client as down without pinging', async () => {
    const ping = jest.fn();
    const connection = { db: { admin: () => ({ ping }) }, readyState: 0 };
    const adapter = new MongodbHealthAdapter(connection as never);

    await expect(adapter.check()).resolves.toEqual({ message: 'readyState=0', status: 'down' });
    expect(ping).not.toHaveBeenCalled();
  });
});
