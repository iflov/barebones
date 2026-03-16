import type { ConfigService } from '@nestjs/config';

import { RedisService } from './redis.service';

interface MockRedisClient {
  connect: jest.Mock<Promise<void>, []>;
  del: jest.Mock<Promise<number>, [string, ...string[]]>;
  expire: jest.Mock<Promise<number>, [string, number]>;
  get: jest.Mock<Promise<string | null>, [string]>;
  ping: jest.Mock<Promise<string>, []>;
  quit: jest.Mock<Promise<string>, []>;
  sadd: jest.Mock<Promise<number>, [string, ...string[]]>;
  scan: jest.Mock<Promise<[string, string[]]>, [string, 'MATCH', string, 'COUNT', number]>;
  smembers: jest.Mock<Promise<string[]>, [string]>;
  srem: jest.Mock<Promise<number>, [string, ...string[]]>;
  set: jest.Mock<Promise<string>, [string, string] | [string, string, 'EX', number]>;
  status: string;
}

let redisClient: MockRedisClient;

jest.mock('ioredis', () => {
  return jest.fn((): MockRedisClient => redisClient);
});

function createConfigService(values: Record<string, unknown>): ConfigService {
  return {
    get: <T>(key: string) => values[key] as T,
  } as ConfigService;
}

describe('RedisService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redisClient = {
      connect: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
      get: jest.fn().mockResolvedValue('value'),
      ping: jest.fn().mockResolvedValue('PONG'),
      quit: jest.fn().mockResolvedValue('OK'),
      sadd: jest.fn().mockResolvedValue(1),
      scan: jest.fn().mockResolvedValue(['0', []]),
      smembers: jest.fn().mockResolvedValue(['member']),
      srem: jest.fn().mockResolvedValue(1),
      set: jest.fn().mockResolvedValue('OK'),
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

    it('uses SCAN instead of KEYS for delByPrefix', async () => {
      const config = createConfigService({ REDIS_ENABLED: 'true' });
      const service = new RedisService(config);
      const client = service.getClient()!;

      client.scan = jest
        .fn()
        .mockResolvedValueOnce(['5', ['prefix:1', 'prefix:2']])
        .mockResolvedValueOnce(['0', ['prefix:3']]);
      client.del = jest.fn().mockResolvedValue(2).mockResolvedValueOnce(2).mockResolvedValueOnce(1);

      await expect(service.delByPrefix('prefix:')).resolves.toBe(3);
      expect(client.scan).toHaveBeenNthCalledWith(1, '0', 'MATCH', 'prefix:*', 'COUNT', 100);
      expect(client.scan).toHaveBeenNthCalledWith(2, '5', 'MATCH', 'prefix:*', 'COUNT', 100);
      expect(client.del).toHaveBeenNthCalledWith(1, 'prefix:1', 'prefix:2');
      expect(client.del).toHaveBeenNthCalledWith(2, 'prefix:3');
    });

    it('supports set membership helpers for session indexes', async () => {
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
