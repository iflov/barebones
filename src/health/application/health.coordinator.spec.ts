import { HealthCoordinator } from './health.coordinator.js';
import type { HealthIndicatorPort } from './ports/health-indicator.port.js';

function indicator(key: string, result: { status: 'down' | 'up' } | Error): HealthIndicatorPort {
  return {
    check: vi
      .fn()
      .mockImplementation(() =>
        result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
      ),
    key,
  };
}

describe('HealthCoordinator', () => {
  it('reports up when every indicator is up', async () => {
    const coordinator = new HealthCoordinator([
      indicator('database', { status: 'up' }),
      indicator('redis', { status: 'up' }),
    ]);

    await expect(coordinator.check()).resolves.toEqual({
      indicators: {
        database: { status: 'up' },
        redis: { status: 'up' },
      },
      status: 'up',
    });
  });

  it('keeps failed indicators visible and reports the system down', async () => {
    const coordinator = new HealthCoordinator([
      indicator('database', { status: 'up' }),
      indicator('redis', { status: 'down' }),
    ]);

    const result = await coordinator.check();

    expect(result.status).toBe('down');
    expect(result.indicators.redis).toEqual({ status: 'down' });
  });

  it('turns a thrown adapter error into a down snapshot', async () => {
    const coordinator = new HealthCoordinator([
      indicator('database', new Error('Connection refused')),
    ]);

    await expect(coordinator.check()).resolves.toEqual({
      indicators: {
        database: { message: 'Connection refused', status: 'down' },
      },
      status: 'down',
    });
  });

  it('maps snapshots to prometheus gauge values', async () => {
    const coordinator = new HealthCoordinator([
      indicator('database', { status: 'up' }),
      indicator('redis', { status: 'down' }),
    ]);

    await expect(coordinator.inspectIndicators()).resolves.toEqual({ database: 1, redis: 0 });
  });
});
