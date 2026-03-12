import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { collectDefaultMetrics, Gauge, Registry } from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly prefix: string;
  private readonly registry = new Registry();

  constructor(configService: ConfigService) {
    this.prefix = configService.get<string>('PROMETHEUS_METRIC_PREFIX') ?? 'admin_';

    collectDefaultMetrics({
      prefix: this.prefix,
      register: this.registry,
    });

    new Gauge({
      help: 'NestJS app bootstrap status',
      name: `${this.prefix}app_up`,
      registers: [this.registry],
    }).set(1);
  }

  getPrefix(): string {
    return this.prefix;
  }

  getRegistry(): Registry {
    return this.registry;
  }

  async render(): Promise<string> {
    return this.registry.metrics();
  }
}
