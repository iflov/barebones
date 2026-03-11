import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { collectDefaultMetrics, Gauge, Registry } from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly registry = new Registry();

  constructor(configService: ConfigService) {
    const prefix = configService.get<string>('PROMETHEUS_METRIC_PREFIX') ?? 'barebones_';

    collectDefaultMetrics({
      prefix,
      register: this.registry,
    });

    new Gauge({
      help: 'NestJS app bootstrap status',
      name: `${prefix}app_up`,
      registers: [this.registry],
    }).set(1);
  }

  async render(): Promise<string> {
    return this.registry.metrics();
  }
}
