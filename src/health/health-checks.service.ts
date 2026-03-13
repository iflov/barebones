import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DiskHealthIndicator,
  type HealthIndicatorFunction,
  MemoryHealthIndicator,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';

import { isFeatureEnabled } from '../config/redis.config';
import { RedisHealthIndicator } from '../infra/health/redis.health-indicator';

/**
 * { key, run } 형태로 묶는 이유:
 *   - key: 결과에서 값을 꺼낼 때 사용 (inspectIndicators에서 result[check.key])
 *   - run: 실제 헬스체크 함수
 *
 * 이렇게 하면 하나의 소스(getNamedChecks)에서 두 가지 용도로 꺼내 쓸 수 있음:
 *   - getChecks(): run만 추출 → HealthController(terminus)용
 *   - inspectIndicators(): key+run 둘 다 사용 → Prometheus 메트릭용
 */
interface NamedHealthIndicatorCheck {
  key: string;
  run: HealthIndicatorFunction;
}

/**
 * 헬스체크 항목의 단일 소스 (Single Source of Truth)
 *
 * 이 서비스 하나에서 모든 헬스체크 항목을 정의하고,
 * 두 개의 소비자가 각자 필요한 형태로 가져감:
 *
 *                getNamedChecks()          ← 체크 항목 정의 (한 곳에서만 관리)
 *                  ↙            ↘
 *         getChecks()      inspectIndicators()
 *         run만 추출         key+run 둘 다 사용
 *            ↓                    ↓
 *     HealthController      HealthMetricsService
 *     GET /admin/health     GET /admin/metrics
 *     JSON 응답 (k8s용)     Prometheus 텍스트 (Grafana용)
 */
@Injectable()
export class HealthChecksService {
  constructor(
    private readonly db: TypeOrmHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
    private readonly disk: DiskHealthIndicator,
    private readonly configService: ConfigService,
    private readonly redis: RedisHealthIndicator,
  ) {}

  /**
   * 모든 헬스체크 항목을 { key, run } 배열로 반환
   *
   * 기본 체크: database, memory_heap, storage (항상 포함)
   * 조건부 체크: redis (REDIS_ENABLED=true일 때만 추가)
   */
  private getNamedChecks(): NamedHealthIndicatorCheck[] {
    const checks: NamedHealthIndicatorCheck[] = [
      {
        key: 'database',
        run: () => this.db.pingCheck('database'),
      },
      {
        key: 'memory_heap',
        run: () =>
          this.memory.checkHeap(
            'memory_heap',
            this.configService.get<number>('HEALTH_MEMORY_HEAP_THRESHOLD') ?? 512 * 1024 * 1024,
          ),
      },
      {
        key: 'storage',
        run: () =>
          this.disk.checkStorage('storage', {
            path: process.platform === 'win32' ? 'C:\\' : '/',
            thresholdPercent: 0.95,
          }),
      },
    ];

    if (isFeatureEnabled(this.configService.get<string | boolean>('REDIS_ENABLED'))) {
      checks.push({
        key: 'redis',
        run: () => this.redis.isHealthy('redis'),
      });
    }

    return checks;
  }

  /**
   * HealthController(terminus)용 — run 함수만 추출
   *
   * terminus의 health.check()는 HealthIndicatorFunction[] 만 받으므로
   * key는 필요 없고 run만 꺼내서 전달
   */
  getChecks(): HealthIndicatorFunction[] {
    return this.getNamedChecks().map((check) => check.run);
  }

  /**
   * HealthMetricsService(Prometheus)용 — 각 indicator의 상태를 숫자로 반환
   *
   * 각 체크를 실행하고 결과를 { database: 1, redis: 0, memory_heap: 1 } 형태로 변환.
   * Prometheus의 Gauge에 세팅할 수 있는 형태 (1=up, 0=down).
   *
   * 호출 시점: Prometheus가 /admin/metrics 스크랩할 때
   *   → registry.metrics() → health_check_status의 collect 콜백 → 여기 호출됨
   */
  async inspectIndicators(): Promise<Record<string, number>> {
    const statusByIndicator: Record<string, number> = {};

    for (const check of this.getNamedChecks()) {
      try {
        const result = await check.run();
        const detail = result[check.key];

        statusByIndicator[check.key] = detail?.status === 'up' ? 1 : 0;
      } catch {
        statusByIndicator[check.key] = this.mapIndicatorErrorToGauge();
      }
    }

    return statusByIndicator;
  }

  /** 체크 실행 중 예외 발생 = 해당 서비스 다운 → 0 반환 */
  private mapIndicatorErrorToGauge(): number {
    return 0;
  }
}
