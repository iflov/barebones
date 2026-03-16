import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface ObservabilityConfigShape {
  prometheus: {
    jobName: string;
    metricsPath: string;
    scrapeTarget: string;
  };
  grafana: {
    excludedRoutes: string[];
  };
  metrics: {
    prefix: string;
  };
}

function loadObservabilityConfig(): ObservabilityConfigShape {
  const path = join(process.cwd(), 'config', 'observability.config.json');

  return JSON.parse(readFileSync(path, 'utf8')) as ObservabilityConfigShape;
}

export const observabilityConfig = loadObservabilityConfig();
export const METRICS_ROUTE_PATH = observabilityConfig.prometheus.metricsPath.replace(/^\/v1\//, '');
