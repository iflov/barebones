import type { ModuleRef } from '@nestjs/core';
import { Registry } from 'prom-client';

import { HealthMetricsService } from './health-metrics.service.js';

function createMocks(inspectResult: Record<string, number> = { database: 1, redis: 0 }) {
  const registry = new Registry();

  const metricsService = {
    getRegistry: () => registry,
    getPrefix: () => 'test_',
  };

  const healthCoordinator = {
    inspectIndicators: vi.fn().mockResolvedValue(inspectResult),
  };
  const moduleRef = {
    get: vi.fn().mockReturnValue(metricsService),
  };

  const service = new HealthMetricsService(
    moduleRef as unknown as ModuleRef,
    healthCoordinator as never,
  );
  service.onModuleInit();

  return { service, registry, healthCoordinator, moduleRef };
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
      const healthCoordinator = {
        inspectIndicators: vi.fn().mockResolvedValue({}),
      };
      const moduleRef = {
        get: vi.fn().mockReturnValue(metricsService),
      };

      const first = new HealthMetricsService(
        moduleRef as unknown as ModuleRef,
        healthCoordinator as never,
      );
      first.onModuleInit();

      const second = new HealthMetricsService(
        moduleRef as unknown as ModuleRef,
        healthCoordinator as never,
      );
      second.onModuleInit();

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
      const { registry, healthCoordinator } = createMocks();

      await registry.metrics();
      await registry.metrics();

      expect(healthCoordinator.inspectIndicators).toHaveBeenCalledTimes(2);
    });

    it('resets previous values before setting new ones', async () => {
      const { registry, healthCoordinator } = createMocks({ database: 1, redis: 1 });

      await registry.metrics();

      // 두 번째 스크랩에서 redis가 사라짐
      healthCoordinator.inspectIndicators.mockResolvedValue({ database: 1 });
      const metrics = await registry.metrics();

      expect(metrics).toContain('indicator="database"');
      expect(metrics).not.toContain('indicator="redis"');
    });
  });
});
