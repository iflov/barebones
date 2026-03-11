import { Controller, Get, Header, Version } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

import { RawResponse } from '../../common/decorators/raw-response.decorator';
import { MetricsService } from './metrics.service';

@ApiExcludeController()
@Controller('admin/metrics')
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
