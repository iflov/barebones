import type { ConfigService } from '@nestjs/config';

import { RedisService } from './redis.service';

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    status: 'ready',
    ping: jest.fn().mockResolvedValue('PONG'),
    connect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue('OK'),
  }));
});

function createConfigService(values: Record<string, unknown>): ConfigService {
  return {
    get: <T>(key: string) => values[key] as T,
  } as ConfigService;
}

describe('RedisService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

    it('does not call connect when client status is ready', async () => {
      const config = createConfigService({ REDIS_ENABLED: 'true' });
      const service = new RedisService(config);
      const client = service.getClient()!;

      await service.ping();

      expect(client.connect).not.toHaveBeenCalled();
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

    it('does nothing when redis is disabled', async () => {
      const config = createConfigService({});
      const service = new RedisService(config);

      await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    });
  });
});
