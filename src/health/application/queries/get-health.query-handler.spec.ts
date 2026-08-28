import { GetHealthQueryHandler } from './get-health.query-handler';

describe('GetHealthQueryHandler', () => {
  it('delegates transport-independent health orchestration to the coordinator', async () => {
    const result = { indicators: {}, status: 'up' };
    const health = { check: vi.fn().mockResolvedValue(result) };
    const handler = new GetHealthQueryHandler(health as never);

    await expect(handler.execute()).resolves.toBe(result);
    expect(health.check).toHaveBeenCalledTimes(1);
  });
});
