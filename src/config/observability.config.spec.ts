import { METRICS_ROUTE_PATH, observabilityConfig } from './observability.config';

describe('observabilityConfig', () => {
  it('loads the shared observability defaults from config', () => {
    expect(observabilityConfig.metrics.prefix).toBe('app_');
    expect(observabilityConfig.prometheus.jobName).toBe('app');
    expect(observabilityConfig.prometheus.metricsPath).toBe('/v1/system/metrics');
    expect(observabilityConfig.prometheus.scrapeTarget).toBe('app:3000');
    expect(observabilityConfig.grafana.excludedRoutes).toEqual(['/v1/system/metrics']);
  });

  it('derives the controller path without the v1 prefix', () => {
    expect(METRICS_ROUTE_PATH).toBe('system/metrics');
  });
});
