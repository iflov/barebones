import type { ModuleRef } from '@nestjs/core';
import { Registry } from '@prometheus-io/client';

import type { SystemHealth } from './domain/system-health.js';
import { HealthMetricsService } from './health-metrics.service.js';

const upAndDown: SystemHealth = {
  indicators: { database: { status: 'up' }, redis: { status: 'down' } },
  status: 'down',
};

function createMocks(health: SystemHealth = upAndDown) {
  const registry = new Registry();

  const metricsService = {
    getRegistry: () => registry,
    getPrefix: () => 'test_',
  };

  const healthPort = {
    check: vi.fn().mockResolvedValue(health),
  };
  const moduleRef = {
    get: vi.fn().mockReturnValue(metricsService),
  };

  const service = new HealthMetricsService(moduleRef as unknown as ModuleRef, healthPort);
  service.onModuleInit();

  return { service, registry, healthPort, moduleRef };
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
      const healthPort = {
        check: vi.fn().mockResolvedValue({ indicators: {}, status: 'up' }),
      };
      const moduleRef = {
        get: vi.fn().mockReturnValue(metricsService),
      };

      const first = new HealthMetricsService(moduleRef as unknown as ModuleRef, healthPort);
      first.onModuleInit();

      const second = new HealthMetricsService(moduleRef as unknown as ModuleRef, healthPort);
      second.onModuleInit();

      // 에러 없이 두 번 생성 가능
      expect(registry.getSingleMetric('test_health_check_status')).toBeDefined();
    });
  });

  describe('collect callback (triggered on scrape)', () => {
    it('outputs indicator values on registry.metrics()', async () => {
      const { registry } = createMocks({
        indicators: {
          database: { status: 'up' },
          redis: { status: 'down' },
          memory_heap: { status: 'up' },
        },
        status: 'down',
      });

      const metrics = await registry.metrics();

      expect(metrics).toContain('test_health_check_status');
      expect(metrics).toContain('indicator="database"');
      expect(metrics).toContain('indicator="redis"');
      expect(metrics).toContain('indicator="memory_heap"');
    });

    /**
     * up/down → 1/0 encoding은 이 adapter가 소유한다. inbound port는 `SystemHealth`만 준다 —
     * 그래야 metrics backend를 바꿔도 health capability의 공개 계약이 그대로다.
     */
    it('owns the up/down to 1/0 encoding', async () => {
      const { registry } = createMocks();

      const metrics = await registry.metrics();

      expect(metrics).toContain('test_health_check_status{indicator="database"} 1');
      expect(metrics).toContain('test_health_check_status{indicator="redis"} 0');
    });

    it('calls the health port on each scrape', async () => {
      const { registry, healthPort } = createMocks();

      await registry.metrics();
      await registry.metrics();

      expect(healthPort.check).toHaveBeenCalledTimes(2);
    });

    it('resets previous values before setting new ones', async () => {
      const { registry, healthPort } = createMocks({
        indicators: { database: { status: 'up' }, redis: { status: 'up' } },
        status: 'up',
      });

      await registry.metrics();

      // 두 번째 스크랩에서 redis가 사라짐
      healthPort.check.mockResolvedValue({
        indicators: { database: { status: 'up' } },
        status: 'up',
      });
      const metrics = await registry.metrics();

      expect(metrics).toContain('indicator="database"');
      expect(metrics).not.toContain('indicator="redis"');
    });
  });
});
