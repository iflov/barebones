import { Controller, Get, Version } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';

import { HealthChecksService } from './health-checks.service';

@ApiTags('health')
@Controller('admin/health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly healthChecksService: HealthChecksService,
  ) {}

  @Get()
  @Version('1')
  @SkipThrottle()
  @HealthCheck()
  @ApiOperation({ summary: 'Application health check' })
  @ApiOkResponse({ description: 'Returns application health information' })
  check() {
    return this.health.check(this.healthChecksService.getChecks());
  }
}
