import { Injectable } from '@nestjs/common';
import { Gauge } from 'prom-client';

import { MetricsService } from '../infra/metrics/metrics.service';
import { HealthChecksService } from './health-checks.service';

@Injectable()
export class HealthMetricsService {
  private readonly gauge: Gauge<'indicator'>;

  constructor(
    metricsService: MetricsService,
    private readonly healthChecksService: HealthChecksService,
  ) {
    const registry = metricsService.getRegistry();
    const metricName = `${metricsService.getPrefix()}health_check_status`;
    const existingGauge = registry.getSingleMetric(metricName) as Gauge<'indicator'> | undefined;

    if (existingGauge !== undefined) {
      this.gauge = existingGauge;
      return;
    }

    this.gauge = new Gauge({
      collect: async () => {
        this.gauge.reset();

        const statuses = await this.healthChecksService.inspectIndicators();

        Object.entries(statuses).forEach(([indicator, value]) => {
          this.gauge.set({ indicator }, value);
        });
      },
      help: 'Health indicator status (1=up, 0=down)',
      labelNames: ['indicator'],
      name: metricName,
      registers: [registry],
    });
  }
}
