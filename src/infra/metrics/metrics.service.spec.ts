import type { ConfigService } from '@nestjs/config';
import type * as PromClient from 'prom-client';
import { collectDefaultMetrics } from 'prom-client';

import { MetricsService } from './metrics.service';

jest.mock('prom-client', (): typeof PromClient => {
  const actual = jest.requireActual<typeof PromClient>('prom-client');
  const collectDefaultMetricsMock = jest.fn() as unknown as typeof actual.collectDefaultMetrics;

  collectDefaultMetricsMock.metricsList = [];

  return {
    ...actual,
    collectDefaultMetrics: collectDefaultMetricsMock,
  };
});

function createConfigService(values: Record<string, unknown>): ConfigService {
  return {
    get: <T>(key: string) => values[key] as T,
  } as ConfigService;
}

describe('MetricsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the configured metrics prefix', () => {
    const service = new MetricsService(
      createConfigService({
        PROMETHEUS_METRIC_PREFIX: 'test_',
      }),
    );

    expect(service.getPrefix()).toBe('test_');
    expect(collectDefaultMetrics).toHaveBeenCalledWith({
      prefix: 'test_',
      register: service.getRegistry(),
    });
  });

  it('falls back to app_ when no prefix is configured', () => {
    const service = new MetricsService(createConfigService({}));

    expect(service.getPrefix()).toBe('app_');
    expect(collectDefaultMetrics).toHaveBeenCalledWith({
      prefix: 'app_',
      register: service.getRegistry(),
    });
  });

  it('registers the app_up gauge as 1', async () => {
    const service = new MetricsService(
      createConfigService({
        PROMETHEUS_METRIC_PREFIX: 'test_',
      }),
    );

    const metric = await service.getRegistry().getSingleMetric('test_app_up')?.get();

    expect(metric).toBeDefined();
    expect(metric?.values[0]?.value).toBe(1);
  });

  it('renders registry metrics in Prometheus text format', async () => {
    const service = new MetricsService(
      createConfigService({
        PROMETHEUS_METRIC_PREFIX: 'test_',
      }),
    );

    const metrics = await service.render();

    expect(metrics).toContain('# HELP test_app_up NestJS app bootstrap status');
    expect(metrics).toContain('test_app_up 1');
  });
});
