/**
 * health capability의 domain 타입.
 *
 * `application/ports/in/`과 함께 **이 capability가 밖에 공개하는 표면**이다. 두 방향의 port가
 * 모두 이 타입을 쓰기 때문에 여기에 둔다 — inbound port(`health.port.ts`)가 반환하고,
 * outbound port(`ports/out/health-indicator.port.ts`)가 개별 indicator에서 받는다.
 * 비공개인 `ports/out/`에 두면 소비자가 결과 타입을 이름 부르려고 비공개 파일을 열어야 한다.
 *
 * 타입과 순수 함수만 둔다. 상태를 읽거나 외부와 말하는 순간 그것은 `application/`이다.
 */
export type HealthStatus = 'down' | 'up';

export interface HealthIndicatorSnapshot {
  readonly message?: string;
  readonly status: HealthStatus;
}

export interface SystemHealth {
  readonly indicators: Readonly<Record<string, HealthIndicatorSnapshot>>;
  readonly status: HealthStatus;
}
