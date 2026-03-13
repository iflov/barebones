import { Registry } from 'prom-client';

import { HealthMetricsService } from './health-metrics.service';

function createMocks(inspectResult: Record<string, number> = { database: 1, redis: 0 }) {
  const registry = new Registry();

  const metricsService = {
    getRegistry: () => registry,
    getPrefix: () => 'test_',
  };

  const healthChecksService = {
    inspectIndicators: jest.fn().mockResolvedValue(inspectResult),
  };

  const service = new (class extends HealthMetricsService {
    constructor() {
      super(metricsService as never, healthChecksService as never);
    }
  })();

  return { service, registry, healthChecksService };
}

describe('HealthMetricsService', () => {
  describe('constructor', () => {
    it('registers health_check_status gauge in the registry', () => {
      const { registry } = createMocks();

      expect(registry.getSingleMetric('test_health_check_status')).toBeDefined();
    });

    it('reuses existing gauge on duplicate construction', () => {
      const registry = new Registry();
      const metricsService = {
        getRegistry: () => registry,
        getPrefix: () => 'test_',
      };
      const healthChecksService = {
        inspectIndicators: jest.fn().mockResolvedValue({}),
      };

      new (class extends HealthMetricsService {
        constructor() {
          super(metricsService as never, healthChecksService as never);
        }
      })();

      new (class extends HealthMetricsService {
        constructor() {
          super(metricsService as never, healthChecksService as never);
        }
      })();

      // 에러 없이 두 번 생성 가능
      expect(registry.getSingleMetric('test_health_check_status')).toBeDefined();
    });
  });

  describe('collect callback (triggered on scrape)', () => {
    it('outputs indicator values on registry.metrics()', async () => {
      const { registry } = createMocks({ database: 1, redis: 0, memory_heap: 1 });

      const metrics = await registry.metrics();

      expect(metrics).toContain('test_health_check_status');
      expect(metrics).toContain('indicator="database"');
      expect(metrics).toContain('indicator="redis"');
      expect(metrics).toContain('indicator="memory_heap"');
    });

    it('calls inspectIndicators on each scrape', async () => {
      const { registry, healthChecksService } = createMocks();

      await registry.metrics();
      await registry.metrics();

      expect(healthChecksService.inspectIndicators).toHaveBeenCalledTimes(2);
    });

    it('resets previous values before setting new ones', async () => {
      const { registry, healthChecksService } = createMocks({ database: 1, redis: 1 });

      await registry.metrics();

      // 두 번째 스크랩에서 redis가 사라짐
      healthChecksService.inspectIndicators.mockResolvedValue({ database: 1 });
      const metrics = await registry.metrics();

      expect(metrics).toContain('indicator="database"');
      expect(metrics).not.toContain('indicator="redis"');
    });
  });
});
