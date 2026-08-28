import type { ConfigService } from '@nestjs/config';
import type { Mock } from 'vitest';

import { RedisService } from './redis.service';

interface MockRedisClient {
  connect: Mock<() => Promise<void>>;
  del: Mock<(...args: [string, ...string[]]) => Promise<number>>;
  expire: Mock<(key: string, ttl: number) => Promise<number>>;
  get: Mock<(key: string) => Promise<string | null>>;
  ping: Mock<() => Promise<string>>;
  quit: Mock<() => Promise<string>>;
  sadd: Mock<(...args: [string, ...string[]]) => Promise<number>>;
  scan: Mock<(...args: [string, 'MATCH', string, 'COUNT', number]) => Promise<[string, string[]]>>;
  smembers: Mock<(key: string) => Promise<string[]>>;
  srem: Mock<(...args: [string, ...string[]]) => Promise<number>>;
  set: Mock<(...args: [string, string] | [string, string, 'EX', number]) => Promise<string>>;
  status: string;
}

let redisClient: MockRedisClient;

vi.mock('ioredis', () => {
  return {
    default: vi.fn(function RedisMock(): MockRedisClient {
      return redisClient;
    }),
  };
});

function createConfigService(values: Record<string, unknown>): ConfigService {
  return {
    get: <T>(key: string) => values[key] as T,
  } as ConfigService;
}

describe('RedisService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      del: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
      get: vi.fn().mockResolvedValue('value'),
      ping: vi.fn().mockResolvedValue('PONG'),
      quit: vi.fn().mockResolvedValue('OK'),
      sadd: vi.fn().mockResolvedValue(1),
      scan: vi.fn().mockResolvedValue(['0', []]),
      smembers: vi.fn().mockResolvedValue(['member']),
      srem: vi.fn().mockResolvedValue(1),
      set: vi.fn().mockResolvedValue('OK'),
      status: 'ready',
    };
  });

  describe('constructor', () => {
    it('creates a Redis client when REDIS_ENABLED is true', () => {
      const config = createConfigService({ REDIS_ENABLED: 'true' });
      const service = new RedisService(config);

      expect(service.getClient()).not.toBeNull();
    });

    it('does not create a client when REDIS_ENABLED is false', () => {
      const config = createConfigService({ REDIS_ENABLED: 'false' });
      const service = new RedisService(config);

      expect(service.getClient()).toBeNull();
    });

    it('does not create a client when REDIS_ENABLED is undefined', () => {
      const config = createConfigService({});
      const service = new RedisService(config);

      expect(service.getClient()).toBeNull();
    });
  });

  describe('ping', () => {
    it('returns PONG when redis is enabled and connected', async () => {
      const config = createConfigService({ REDIS_ENABLED: 'true' });
      const service = new RedisService(config);

      const result = await service.ping();

      expect(result).toBe('PONG');
    });

    it('returns DISABLED when redis is not enabled', async () => {
      const config = createConfigService({});
      const service = new RedisService(config);

      const result = await service.ping();

      expect(result).toBe('DISABLED');
    });

    it('calls connect when client status is wait', async () => {
      const config = createConfigService({ REDIS_ENABLED: 'true' });
      const service = new RedisService(config);
      const client = service.getClient()!;

      Object.defineProperty(client, 'status', { value: 'wait', writable: true });

      await service.ping();

      expect(client.connect).toHaveBeenCalled();
    });
  });

  describe('helpers', () => {
    it('sets, gets, and deletes values', async () => {
      const config = createConfigService({ REDIS_ENABLED: 'true' });
      const service = new RedisService(config);
      const client = service.getClient()!;

      await expect(service.set('key', 'value', 60)).resolves.toBe('OK');
      await expect(service.get('key')).resolves.toBe('value');
      await expect(service.del('key')).resolves.toBe(1);

      expect(client.set).toHaveBeenCalledWith('key', 'value', 'EX', 60);
      expect(client.get).toHaveBeenCalledWith('key');
      expect(client.del).toHaveBeenCalledWith('key');
    });

    // delByPrefix 테스트는 메서드와 함께 제거했다 (redis.service.ts의 주석 참고).
    //
    // 이 테스트는 D-1-M의 교본이었다: `scan`/`del`을 mock하고 **넘긴 인자**를 단언했기 때문에
    // 항상 통과했지만, 실제 ioredis에서는 keyPrefix 때문에 0개를 지운다는 사실은 검증하지
    // 못했다. "구현을 통째로 mock으로 바꿔도 통과하는가?" — 통과했다.

    it('supports generic set membership helpers', async () => {
      const config = createConfigService({ REDIS_ENABLED: 'true' });
      const service = new RedisService(config);
      const client = service.getClient()!;

      await expect(service.sAdd('set-key', 'a', 'b')).resolves.toBe(1);
      await expect(service.sMembers('set-key')).resolves.toEqual(['member']);
      await expect(service.sRem('set-key', 'a')).resolves.toBe(1);
      await expect(service.expire('set-key', 60)).resolves.toBe(1);

      expect(client.sadd).toHaveBeenCalledWith('set-key', 'a', 'b');
      expect(client.smembers).toHaveBeenCalledWith('set-key');
      expect(client.srem).toHaveBeenCalledWith('set-key', 'a');
      expect(client.expire).toHaveBeenCalledWith('set-key', 60);
    });

    it('throws a clear error when disabled helpers are used without Redis', async () => {
      const config = createConfigService({ REDIS_ENABLED: 'false' });
      const service = new RedisService(config);

      await expect(service.get('key')).rejects.toThrow(
        'Redis is disabled. Set REDIS_ENABLED=true to use Redis-backed features.',
      );
    });
  });

  describe('onModuleDestroy', () => {
    it('calls quit when client exists and is not ended', async () => {
      const config = createConfigService({ REDIS_ENABLED: 'true' });
      const service = new RedisService(config);
      const client = service.getClient()!;

      await service.onModuleDestroy();

      expect(client.quit).toHaveBeenCalled();
    });

    it('does not call quit when client status is end', async () => {
      const config = createConfigService({ REDIS_ENABLED: 'true' });
      const service = new RedisService(config);
      const client = service.getClient()!;

      Object.defineProperty(client, 'status', { value: 'end', writable: true });

      await service.onModuleDestroy();

      expect(client.quit).not.toHaveBeenCalled();
    });
  });
});
