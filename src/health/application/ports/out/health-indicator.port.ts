import type { HealthIndicatorSnapshot } from '../../../domain/system-health.js';

/**
 * 개별 의존성 상태를 조회하는 outbound port — **내가 밖에 요구하는 계약**이라 비공개다.
 *
 * 여기가 의존 역전이 실제로 값을 하는 자리다. coordinator는 RDB인지 Redis인지 디스크인지
 * 모른 채 `check()`만 부르고, 그래서 실물 의존성 없이 테스트된다.
 */
export interface HealthIndicatorPort {
  readonly key: string;
  check(): Promise<HealthIndicatorSnapshot>;
}

export const HEALTH_INDICATORS = Symbol('HEALTH_INDICATORS');
