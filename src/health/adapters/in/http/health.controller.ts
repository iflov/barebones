import { Controller, Get, Inject, ServiceUnavailableException, Version } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

import { HEALTH_ROUTE_PATH } from '../../../../config/observability.config.js';
import { HEALTH, type HealthPort } from '../../../application/ports/in/health.port.js';
import type { SystemHealth } from '../../../domain/system-health.js';

/** HTTP inbound adapter. 헬스 판단은 inbound port에 위임하고 HTTP 상태만 변환한다. */
@ApiTags('health')
@Controller(HEALTH_ROUTE_PATH)
export class HealthController {
  constructor(@Inject(HEALTH) private readonly health: HealthPort) {}

  @Get()
  @Version('1')
  @SkipThrottle()
  @ApiOperation({ summary: 'Application health check' })
  @ApiOkResponse({ description: 'Returns application health information' })
  async check(): Promise<SystemHealth> {
    const result = await this.health.check();

    if (result.status === 'down') {
      throw new ServiceUnavailableException('Health check failed');
    }

    return result;
  }
}
