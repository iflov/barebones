import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { observabilityConfig } from '../src/config/observability.config.js';

const DASHBOARD_FILES = [
  'ops/grafana/provisioning/dashboards/json/bullmq-jobs.json',
  'ops/grafana/provisioning/dashboards/json/http-performance.json',
  'ops/grafana/provisioning/dashboards/json/infra-health.json',
  'ops/grafana/provisioning/dashboards/json/nodejs-overview.json',
];

const knownMetricRoots = ['app_up', 'bullmq_', 'health_', 'http_', 'nodejs_', 'process_'];

const PROMETHEUS_OUTPUT_PATH = 'ops/prometheus/prometheus.yml';

function replacePrometheusJob(expression: string): string {
  return expression.replace(/job="[^"]+"/g, `job="${observabilityConfig.prometheus.jobName}"`);
}

function replaceExcludedRoute(expression: string): string {
  const excludedRoute = observabilityConfig.grafana.excludedRoutes[0];

  if (excludedRoute === undefined) {
    return expression;
  }

  return expression.replace(/route!="[^"]+"/g, `route!="${excludedRoute}"`);
}

function replaceMetricPrefixes(expression: string): string {
  let next = expression;

  for (const root of knownMetricRoots) {
    const regex = new RegExp(`\\b[a-zA-Z0-9]+_${root}`, 'g');
    next = next.replace(regex, `${observabilityConfig.metrics.prefix}${root}`);
  }

  return next;
}

function renderPrometheusConfig(): string {
  return [
    'global:',
    '  scrape_interval: 15s',
    '  evaluation_interval: 15s',
    '',
    'scrape_configs:',
    `  - job_name: ${observabilityConfig.prometheus.jobName}`,
    `    metrics_path: ${observabilityConfig.prometheus.metricsPath}`,
    '    static_configs:',
    '      - targets:',
    `          - ${observabilityConfig.prometheus.scrapeTarget}`,
    '',
    '  - job_name: prometheus',
    '    static_configs:',
    '      - targets:',
    '          - localhost:9090',
    '',
  ].join('\n');
}

function rewriteExpression(expression: string): string {
  return replaceMetricPrefixes(replaceExcludedRoute(replacePrometheusJob(expression)));
}

function rewriteDashboardValue(value: unknown, key?: string): unknown {
  if (typeof value === 'string') {
    return key === 'expr' ? rewriteExpression(value) : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => rewriteDashboardValue(item));
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, child]) => [
        childKey,
        rewriteDashboardValue(child, childKey),
      ]),
    );
  }

  return value;
}

function writeFile(path: string, contents: string, checkOnly: boolean): string | null {
  const normalized = `${contents.trimEnd()}\n`;
  const existing = readFileSync(path, 'utf8');

  if (existing === normalized) {
    return null;
  }

  if (checkOnly) {
    return path;
  }

  writeFileSync(path, normalized, 'utf8');
  return null;
}

function rewriteDashboard(path: string, checkOnly: boolean): string | null {
  const existing = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  const rewritten = rewriteDashboardValue(existing);
  const next = `${JSON.stringify(rewritten, null, 2)}\n`;

  return writeFile(path, next, checkOnly);
}

function main(): void {
  const checkOnly = process.argv.includes('--check');
  const changedFiles: string[] = [];

  const prometheusPath = join(process.cwd(), PROMETHEUS_OUTPUT_PATH);
  mkdirSync(dirname(prometheusPath), { recursive: true });

  const promResult = writeFile(prometheusPath, renderPrometheusConfig(), checkOnly);
  if (promResult !== null) {
    changedFiles.push(promResult);
  }

  for (const file of DASHBOARD_FILES) {
    const result = rewriteDashboard(join(process.cwd(), file), checkOnly);
    if (result !== null) {
      changedFiles.push(result);
    }
  }

  if (checkOnly && changedFiles.length > 0) {
    process.stderr.write('Observability artifacts are stale:\n');
    changedFiles.forEach((file) => process.stderr.write(`- ${file}\n`));
    process.exit(1);
  }

  if (!checkOnly) {
    process.stdout.write('Generated observability artifacts.\n');
  }
}

main();
