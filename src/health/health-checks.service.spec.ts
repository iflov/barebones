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
    it('returns 4 check functions', () => {
      const { service } = createMocks();

      const checks = service.getChecks();

      expect(checks).toHaveLength(4);
      checks.forEach((fn) => expect(typeof fn).toBe('function'));
    });

    /**
     * constitution E-1.
     *
     * REDIS_ENABLED=false여도 항목 수는 그대로다. 목록에서 빼면 헬스체크가 200 OK를
     * 반환해서, 의존성이 죽은 배포가 정상으로 보인다.
     */
    it('keeps the redis check even when redis is disabled', () => {
      const { service } = createMocks({ REDIS_ENABLED: 'false' });

      expect(service.getChecks()).toHaveLength(4);
    });
  });

  describe('inspectIndicators', () => {
    it('returns all indicators as 1 when everything is healthy', async () => {
      const { service } = createMocks();

      const result = await service.inspectIndicators();

      expect(result).toEqual({
        database: 1,
        memory_heap: 1,
        redis: 1,
        storage: 1,
      });
    });

    /**
     * 게이지가 사라지지 않고 `0`으로 남아야 Prometheus 알람 룰이 발동할 대상이 생긴다
     * (constitution E-1).
     */
    it('reports a disabled dependency as 0 instead of dropping the gauge', async () => {
      const { service, redis } = createMocks({ REDIS_ENABLED: 'false' });
      redis.isHealthy.mockResolvedValue({ redis: { status: 'down' } });

      const result = await service.inspectIndicators();

      expect(result.redis).toBe(0);
      expect(Object.keys(result)).toContain('redis');
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
