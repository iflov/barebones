import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Gauge } from 'prom-client';

import { MetricsService } from '../infra/metrics/metrics.service.js';
import { HealthCoordinator } from './application/health.coordinator.js';

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
 *     GET /v1/<preset-metrics-path>
 *       → preset metrics controller
 *         → metricsService.render()
 *           → registry.metrics()
 *             → prom-client가 이 Gauge의 collect 콜백 자동 실행
 *               → gauge.reset() (이전 값 초기화)
 *               → healthCoordinator.inspectIndicators() (DB, Redis 등 체크)
 *               → gauge.set({ indicator: 'database' }, 1) 등 값 세팅
 *             → 텍스트로 직렬화하여 반환
 *
 * Prometheus 출력 예시:
 *   app_health_check_status{indicator="database"} 1
 *   app_health_check_status{indicator="redis"} 0
 *   app_health_check_status{indicator="memory_heap"} 1
 */
@Injectable()
export class HealthMetricsService implements OnModuleInit {
  private gauge?: Gauge<'indicator'>;

  constructor(
    /**
     * MetricsService를 constructor에서 직접 주입하지 않고 ModuleRef로 지연 조회하는 이유:
     *
     * - HealthModule은 기본적으로 항상 살아 있어야 하는 기반 모듈이다.
     * - 반면 MetricsService는 Prometheus 사용 여부에 따라 빠질 수 있는 선택 요소다.
     * - 따라서 여기서 MetricsService를 강제 주입하면, metrics를 끄거나
     *   MetricsModule을 제외한 구성에서 HealthModule까지 함께 깨질 수 있다.
     *
     * 즉, Health는 독립적으로 동작하고,
     * Metrics가 있을 때만 health_check_status gauge를 붙이기 위해
     * ModuleRef + onModuleInit 조합으로 느슨하게 연결한다.
     */
    private readonly moduleRef: ModuleRef,
    private readonly healthCoordinator: HealthCoordinator,
  ) {}

  onModuleInit(): void {
    /**
     * strict: false 로 조회하는 이유:
     * - 현재 모듈 범위에 MetricsService가 없더라도
     *   앱 전체 컨테이너에서 선택적으로 찾아오기 위해서다.
     * - 없으면 조용히 skip 하고, 있으면 metrics registry에 gauge를 등록한다.
     */
    const metricsService = this.moduleRef.get(MetricsService, { strict: false });

    if (metricsService === undefined) {
      /**
       * MetricsService가 없다는 것은 metrics 기능이 비활성화된 구성일 수 있다는 뜻이다.
       * 이 경우 health metrics gauge를 만들지 않고 종료한다.
       * 그래도 health endpoint 자체는 계속 정상 동작해야 한다.
       */
      return;
    }

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

    /**
     * this.gauge 대신 지역 변수 gauge를 callback 안에서 사용하는 이유:
     * - this.gauge는 optional 필드라서 TypeScript가 undefined 가능성을 계속 추적한다.
     * - 생성 직후에는 gauge가 확실히 존재하므로, collect 콜백에서는
     *   지역 변수 gauge를 캡처해서 쓰는 편이 더 안전하고 단순하다.
     */
    const gauge = new Gauge({
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
        gauge.reset();

        const statuses = await this.healthCoordinator.inspectIndicators();

        Object.entries(statuses).forEach(([indicator, value]) => {
          gauge.set({ indicator }, value);
        });
      },
      help: 'Health indicator status (1=up, 0=down)',
      labelNames: ['indicator'],
      name: metricName,
      registers: [registry],
    });
    this.gauge = gauge;
  }
}
