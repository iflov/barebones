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

/**
 * 헬스체크 라우트 경로.
 *
 * `METRICS_ROUTE_PATH`와 달리 생성기 소유가 아니다 — Prometheus가 scrape하는 대상이 아니라
 * `observability.config.json`에 없다. 그래도 상수로 두는 이유는 컨트롤러와 로그 노이즈 필터가
 * **같은 값을 봐야** 하기 때문이다. 손으로 두 번 적으면 한쪽만 바뀌어도 필터가 조용히 죽는다.
 */
export const HEALTH_ROUTE_PATH = 'system/health';
