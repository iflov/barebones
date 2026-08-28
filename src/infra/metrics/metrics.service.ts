import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { collectDefaultMetrics, Gauge, Registry } from 'prom-client';

import { observabilityConfig } from '../../config/observability.config.js';

/**
 * Prometheus 메트릭의 중앙 관리자 (싱글톤)
 *
 * 역할:
 *   1. Registry(메트릭 저장소) 생성 및 소유
 *   2. 기본 Node.js 메트릭(CPU, 메모리 등) 자동 등록
 *   3. 다른 서비스(HealthMetricsService 등)에 registry를 공유
 *   4. Prometheus 스크랩 시 registry의 모든 메트릭을 텍스트로 직렬화
 *
 * 흐름:
 *   앱 기동 → MetricsService 생성 → Registry에 기본 메트릭 + app_up 등록
 *   스크랩 시 → preset metrics controller → render() → registry.metrics() → 텍스트 반환
 */
@Injectable()
export class MetricsService {
  private readonly prefix: string;

  /**
   * Registry = 메트릭들의 컨테이너 (창고)
   * 글로벌 registry 대신 전용 registry를 사용해서 다른 라이브러리의 메트릭과 격리.
   * 여기에 등록된 메트릭만 active preset metrics route에 노출된다.
   */
  private readonly registry = new Registry();

  constructor(configService: ConfigService) {
    this.prefix =
      configService.get<string>('PROMETHEUS_METRIC_PREFIX') ?? observabilityConfig.metrics.prefix;

    /**
     * Node.js 런타임 기본 메트릭을 registry에 자동 등록
     * - process_cpu_seconds_total (CPU 사용량)
     * - nodejs_heap_size_total_bytes (힙 메모리)
     * - nodejs_eventloop_lag_seconds (이벤트루프 지연) 등
     */
    collectDefaultMetrics({
      prefix: this.prefix,
      register: this.registry,
    });

    /**
     * 앱 부트스트랩 완료 표시
     *
     * Prometheus 메트릭 타입 4가지:
     *   - Counter: 증가만 가능 (누적) → 요청 수, 에러 수
     *   - Gauge: 올라가고 내려감 → 온도, 메모리, 상태값
     *   - Histogram: 값의 분포 측정 → 응답시간 (p50, p95, p99)
     *   - Summary: Histogram과 유사, 클라이언트에서 계산
     *
     * .set(1) = "이 앱은 정상 기동됨" 신호
     * Prometheus의 up{} 메트릭은 네트워크 연결만 확인하지만,
     * app_up은 NestJS DI까지 완료됐는지 = 실제 앱이 준비됐는지를 나타냄
     */
    new Gauge({
      help: 'NestJS app bootstrap status',
      name: `${this.prefix}app_up`,
      registers: [this.registry],
    }).set(1);
  }

  getPrefix(): string {
    return this.prefix;
  }

  /** 다른 서비스가 이 registry에 메트릭을 추가할 수 있게 공유 */
  getRegistry(): Registry {
    return this.registry;
  }

  /**
   * Registry에 등록된 모든 메트릭을 Prometheus 텍스트 포맷으로 직렬화
   *
   * 반환 예시:
   *   # HELP app_app_up NestJS app bootstrap status
   *   app_app_up 1
   *   # HELP app_health_check_status Health indicator status (1=up, 0=down)
   *   app_health_check_status{indicator="database"} 1
   *
   * 내부적으로 collect 콜백이 있는 메트릭은 이 시점에 콜백이 실행됨
   */
  async render(): Promise<string> {
    return this.registry.metrics();
  }
}
