import { Injectable } from '@nestjs/common';
import { Gauge } from 'prom-client';

import { MetricsService } from '../infra/metrics/metrics.service';
import { HealthChecksService } from './health-checks.service';

/**
 * 헬스체크 결과를 Prometheus Gauge 메트릭으로 노출하는 서비스
 *
 * MetricsService의 Registry에 health_check_status Gauge를 등록하고,
 * Prometheus 스크랩 시점에 collect 콜백을 통해 최신 헬스 상태를 수집.
 *
 * 흐름:
 *   앱 기동 → HealthMetricsService 생성 → Gauge를 registry에 등록 (collect 콜백만 등록, 아직 실행 안 됨)
 *
 *   Prometheus 스크랩 시:
 *     GET /admin/metrics
 *       → MetricsController.index()
 *         → metricsService.render()
 *           → registry.metrics()
 *             → prom-client가 이 Gauge의 collect 콜백 자동 실행
 *               → gauge.reset() (이전 값 초기화)
 *               → healthChecksService.inspectIndicators() (DB, Redis 등 체크)
 *               → gauge.set({ indicator: 'database' }, 1) 등 값 세팅
 *             → 텍스트로 직렬화하여 반환
 *
 * Prometheus 출력 예시:
 *   admin_health_check_status{indicator="database"} 1
 *   admin_health_check_status{indicator="redis"} 0
 *   admin_health_check_status{indicator="memory_heap"} 1
 */
@Injectable()
export class HealthMetricsService {
  private readonly gauge: Gauge<'indicator'>;

  constructor(
    metricsService: MetricsService,
    private readonly healthChecksService: HealthChecksService,
  ) {
    const registry = metricsService.getRegistry();
    const metricName = `${metricsService.getPrefix()}health_check_status`;

    /**
     * 중복 등록 방지 — 핫 리로드나 테스트 환경에서 같은 이름의 메트릭이
     * 이미 registry에 있으면 재사용하고, 없을 때만 새로 생성
     */
    const existingGauge = registry.getSingleMetric(metricName) as Gauge<'indicator'> | undefined;

    if (existingGauge !== undefined) {
      this.gauge = existingGauge;
      return;
    }

    this.gauge = new Gauge({
      /**
       * collect 콜백 = Prometheus 스크랩 시점에 prom-client가 자동 호출하는 훅
       *
       * setInterval로 주기적 업데이트하는 방식과 비교:
       *   - setInterval: 스크랩과 타이밍 어긋나면 stale 데이터, 생명주기 관리 필요
       *   - collect: 스크랩할 때만 실행, 항상 최신 데이터, 관리 불필요
       *
       * reset()이 필요한 이유:
       *   Redis를 비활성화하면 inspectIndicators()가 redis를 반환하지 않는데,
       *   reset 없이면 이전 스크랩의 redis 값이 그대로 남아 잘못된 메트릭 노출
       */
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
