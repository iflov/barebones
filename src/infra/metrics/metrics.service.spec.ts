import type { ConfigService } from '@nestjs/config';
import type * as PromClient from 'prom-client';
import { collectDefaultMetrics } from 'prom-client';

import { MetricsService } from './metrics.service';

vi.mock('prom-client', async (): Promise<typeof PromClient> => {
  const actual = await vi.importActual<typeof PromClient>('prom-client');
  const collectDefaultMetricsMock = vi.fn() as unknown as typeof actual.collectDefaultMetrics;

  collectDefaultMetricsMock.metricsList = [];

  // 서드파티 모듈 표면을 그대로 다시 내보내면서 하나만 교체한다.
  // 여기서 필드를 명시할 수는 없다 — 우리가 정의한 구조가 아니라 prom-client의 것이고,
  // 손으로 나열하면 버전이 올라갈 때마다 조용히 빠진 export가 생긴다.
  // constitution A-5의 예외이며, 객체 spread 대신 Object.assign을 쓴다.
  return Object.assign({}, actual, { collectDefaultMetrics: collectDefaultMetricsMock });
});

function createConfigService(values: Record<string, unknown>): ConfigService {
  return {
    get: <T>(key: string) => values[key] as T,
  } as ConfigService;
}

describe('MetricsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
