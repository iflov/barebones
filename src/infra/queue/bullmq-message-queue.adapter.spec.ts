import { BullmqMessageQueueAdapter } from './bullmq-message-queue.adapter.js';

describe('BullmqMessageQueueAdapter', () => {
  it('translates the broker-neutral message into BullMQ options', async () => {
    const queue = { add: vi.fn().mockResolvedValue(undefined) };
    const adapter = new BullmqMessageQueueAdapter(queue as never);

    await adapter.publish({
      name: 'sync-catalog',
      options: { attempts: 5, deduplicationKey: 'catalog-42', delayMs: 1000 },
      payload: { catalogId: '42' },
    });

    expect(queue.add).toHaveBeenCalledWith(
      'sync-catalog',
      { catalogId: '42' },
      {
        attempts: 5,
        deduplication: { id: 'catalog-42' },
        delay: 1000,
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  });

  it('uses the portable retry default', async () => {
    const queue = { add: vi.fn().mockResolvedValue(undefined) };
    const adapter = new BullmqMessageQueueAdapter(queue as never);

    await adapter.publish({ name: 'rebuild', payload: {} });

    expect(queue.add).toHaveBeenCalledWith(
      'rebuild',
      {},
      {
        attempts: 3,
        deduplication: undefined,
        delay: undefined,
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  });
});
