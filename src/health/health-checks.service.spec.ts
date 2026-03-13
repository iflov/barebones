import type { ConfigService } from '@nestjs/config';

import { HealthChecksService } from './health-checks.service';

function createConfigService(values: Record<string, unknown>): ConfigService {
  return {
    get: <T>(key: string) => values[key] as T,
  } as ConfigService;
}

function createMocks(configValues: Record<string, unknown> = {}) {
  const db = {
    pingCheck: jest.fn().mockResolvedValue({ database: { status: 'up' } }),
  };
  const memory = {
    checkHeap: jest.fn().mockResolvedValue({ memory_heap: { status: 'up' } }),
  };
  const disk = {
    checkStorage: jest.fn().mockResolvedValue({ storage: { status: 'up' } }),
  };
  const redis = {
    isHealthy: jest.fn().mockResolvedValue({ redis: { status: 'up' } }),
  };
  const configService = createConfigService(configValues);

  const service = new (class extends HealthChecksService {
    constructor() {
      super(db as never, memory as never, disk as never, configService, redis as never);
    }
  })();

  return { service, db, memory, disk, redis, configService };
}

describe('HealthChecksService', () => {
  describe('getChecks', () => {
    it('returns 3 check functions when redis is disabled', () => {
      const { service } = createMocks();

      const checks = service.getChecks();

      expect(checks).toHaveLength(3);
      checks.forEach((fn) => expect(typeof fn).toBe('function'));
    });

    it('returns 4 check functions when redis is enabled', () => {
      const { service } = createMocks({ REDIS_ENABLED: 'true' });

      const checks = service.getChecks();

      expect(checks).toHaveLength(4);
    });
  });

  describe('inspectIndicators', () => {
    it('returns all indicators as 1 when everything is healthy', async () => {
      const { service } = createMocks();

      const result = await service.inspectIndicators();

      expect(result).toEqual({
        database: 1,
        memory_heap: 1,
        storage: 1,
      });
    });

    it('includes redis when enabled', async () => {
      const { service } = createMocks({ REDIS_ENABLED: 'true' });

      const result = await service.inspectIndicators();

      expect(result).toEqual({
        database: 1,
        memory_heap: 1,
        storage: 1,
        redis: 1,
      });
    });

    it('returns 0 for a down indicator', async () => {
      const { service, db } = createMocks();
      db.pingCheck.mockResolvedValue({ database: { status: 'down' } });

      const result = await service.inspectIndicators();

      expect(result.database).toBe(0);
    });

    it('returns 0 when a check throws an error', async () => {
      const { service, db } = createMocks();
      db.pingCheck.mockRejectedValue(new Error('Connection refused'));

      const result = await service.inspectIndicators();

      expect(result.database).toBe(0);
      expect(result.memory_heap).toBe(1);
      expect(result.storage).toBe(1);
    });

    it('uses custom memory threshold from config', async () => {
      const threshold = 256 * 1024 * 1024;
      const { service, memory } = createMocks({ HEALTH_MEMORY_HEAP_THRESHOLD: threshold });

      await service.inspectIndicators();

      expect(memory.checkHeap).toHaveBeenCalledWith('memory_heap', threshold);
    });

    it('uses default memory threshold when not configured', async () => {
      const { service, memory } = createMocks();

      await service.inspectIndicators();

      expect(memory.checkHeap).toHaveBeenCalledWith('memory_heap', 512 * 1024 * 1024);
    });
  });
});
