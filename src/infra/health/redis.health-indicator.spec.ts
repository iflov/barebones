import { RedisHealthIndicator } from './redis.health-indicator';

function createMockCheck() {
  const upResult = { redis: { status: 'up' } };
  const downResult = { redis: { status: 'down' } };

  return {
    up: jest.fn().mockReturnValue(upResult),
    down: jest.fn().mockReturnValue(downResult),
    upResult,
    downResult,
  };
}

function createMocks(pingResponse: string) {
  const mockCheck = createMockCheck();

  const redisService = {
    ping: jest.fn().mockResolvedValue(pingResponse),
  };

  const healthIndicatorService = {
    check: jest.fn().mockReturnValue({
      up: mockCheck.up,
      down: mockCheck.down,
    }),
  };

  const indicator = new RedisHealthIndicator(
    redisService as never,
    healthIndicatorService as never,
  );

  return { indicator, redisService, healthIndicatorService, mockCheck };
}

describe('RedisHealthIndicator', () => {
  describe('isHealthy', () => {
    it('returns up when redis responds with PONG', async () => {
      const { indicator, healthIndicatorService, mockCheck } = createMocks('PONG');

      const result = await indicator.isHealthy('redis');

      expect(healthIndicatorService.check).toHaveBeenCalledWith('redis');
      expect(mockCheck.up).toHaveBeenCalled();
      expect(mockCheck.down).not.toHaveBeenCalled();
      expect(result).toEqual(mockCheck.upResult);
    });

    it('returns down when redis responds with something other than PONG', async () => {
      const { indicator, healthIndicatorService, mockCheck } = createMocks('ERROR');

      const result = await indicator.isHealthy('redis');

      expect(healthIndicatorService.check).toHaveBeenCalledWith('redis');
      expect(mockCheck.down).toHaveBeenCalledWith('ERROR');
      expect(mockCheck.up).not.toHaveBeenCalled();
      expect(result).toEqual(mockCheck.downResult);
    });

    it('passes the key parameter to healthIndicatorService.check', async () => {
      const { indicator, healthIndicatorService } = createMocks('PONG');

      await indicator.isHealthy('custom-key');

      expect(healthIndicatorService.check).toHaveBeenCalledWith('custom-key');
    });
  });
});
