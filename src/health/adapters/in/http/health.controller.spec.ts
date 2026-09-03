import { ServiceUnavailableException } from '@nestjs/common';

import type { HealthPort } from '../../../application/ports/in/health.port.js';
import type { SystemHealth } from '../../../domain/system-health.js';
import { HealthController } from './health.controller.js';

/**
 * 소비자 test는 상대의 **inbound port fake**를 주입한다(ARCHITECTURE.md 「Tests and enforcement」).
 * 대역이 `check`라는 메서드 이름을 갖는 것이 값이다 — 버스 시절에는 `execute()` 하나였다.
 */
function port(result: SystemHealth): HealthPort {
  return {
    check: vi.fn().mockResolvedValue(result),
    inspectIndicators: vi.fn(),
  };
}

describe('HealthController', () => {
  it('returns the system health as-is when it is up', async () => {
    const health: SystemHealth = { indicators: { database: { status: 'up' } }, status: 'up' };

    await expect(new HealthController(port(health)).check()).resolves.toBe(health);
  });

  it('maps a down system to 503', async () => {
    const health: SystemHealth = { indicators: { redis: { status: 'down' } }, status: 'down' };

    await expect(new HealthController(port(health)).check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
