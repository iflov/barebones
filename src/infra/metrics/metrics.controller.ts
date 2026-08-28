import { Controller, Get, Header, Version } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

import { RawResponse } from '../../common/decorators/raw-response.decorator.js';
import { METRICS_ROUTE_PATH } from '../../config/observability.config.js';
import { MetricsService } from './metrics.service.js';

@ApiExcludeController()
@Controller(METRICS_ROUTE_PATH)
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @Version('1')
  @SkipThrottle()
  @RawResponse()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async index(): Promise<string> {
    return this.metricsService.render();
  }
}
