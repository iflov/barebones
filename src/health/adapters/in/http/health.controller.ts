import { Controller, Get, ServiceUnavailableException, Version } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

import { HEALTH_ROUTE_PATH } from '../../../../config/observability.config.js';
import type { SystemHealth } from '../../../application/ports/health-indicator.port.js';
import { GetHealthQuery } from '../../../application/queries/get-health.query.js';

/** HTTP inbound adapter. 헬스 판단은 application 계층에 위임하고 HTTP 상태만 변환한다. */
@ApiTags('health')
@Controller(HEALTH_ROUTE_PATH)
export class HealthController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  @Version('1')
  @SkipThrottle()
  @ApiOperation({ summary: 'Application health check' })
  @ApiOkResponse({ description: 'Returns application health information' })
  async check(): Promise<SystemHealth> {
    const result = await this.queryBus.execute<GetHealthQuery, SystemHealth>(new GetHealthQuery());

    if (result.status === 'down') {
      throw new ServiceUnavailableException('Health check failed');
    }

    return result;
  }
}
