export type HealthStatus = 'down' | 'up';

export interface HealthIndicatorSnapshot {
  readonly message?: string;
  readonly status: HealthStatus;
}

/** 개별 의존성 상태를 조회하는 outbound port. */
export interface HealthIndicatorPort {
  readonly key: string;
  check(): Promise<HealthIndicatorSnapshot>;
}

export interface SystemHealth {
  readonly indicators: Readonly<Record<string, HealthIndicatorSnapshot>>;
  readonly status: HealthStatus;
}

export const HEALTH_INDICATORS = Symbol('HEALTH_INDICATORS');
