import type { SystemHealth } from '../../../domain/system-health.js';

/**
 * health capability가 **밖에 제공하는 것 전부** — inbound port.
 *
 * `ports/out/`과 짝이고 방향이 곧 공개 여부다. `in`은 밖에서 나를 부르는 계약이라 공개하고,
 * `out`은 내가 디스크·DB·Redis를 부르는 계약이라 감춘다. 소비자는 아래 `HEALTH` Symbol만
 * 런타임에 잡고 타입은 `import type`으로 본다 — 구현 클래스가 소비자의 import 그래프에
 * 들어가지 않으므로 capability 사이 순환 참조가 생기지 않는다.
 *
 * ## 전에는 여기가 `GetHealthQuery` + `QueryBus`였다
 *
 * `ARCHITECTURE.md`의 「전역 Command/Query 버스는 기본이 아니다」가 정한 조건 —
 * 같은 메시지를 여러 inbound가 보내거나 dispatch 자체가 값을 하는 경우 — 을 만족하지
 * 못했다. 보내는 곳이 `health.controller.ts` 하나였고 handler는 `coordinator.check()`를
 * 그대로 전달했다.
 *
 * 버스 시절의 함정 하나가 함께 사라진다: `execute<GetHealthQuery, SystemHealth>(...)`처럼
 * 타입 인자를 둘 명시하면 `@nestjs/cqrs`의 두 번째 오버로드가 잡혀 **결과 타입을 거짓말해도
 * `tsc`가 통과시켰다**(파생 프로젝트에서 실측). 메서드 시그니처에는 그 문제가 없다 —
 * 결과 타입이 여기 한 번 적히고 호출부는 추론만 받는다.
 */
export interface HealthPort {
  /**
   * 활성 의존성을 모두 확인한 판정. `up`/`down`을 무엇으로 옮길지는 호출부가 정한다 —
   * HTTP adapter는 `200`/`503`으로, Prometheus adapter는 gauge의 `1`/`0`으로 옮긴다.
   *
   * ⚠ **그 숫자 encoding을 여기에 두지 않는다.** 한때 `inspectIndicators(): Promise<Record<
   * string, number>>`가 이 계약에 있었고, 그것은 gauge 표현을 capability의 공개 API로
   * 만드는 것이었다 — metrics backend를 바꾸면 health의 외부 계약이 따라 바뀐다. 표현은
   * 그것을 요구하는 adapter가 소유한다.
   */
  check(): Promise<SystemHealth>;
}

/**
 * 주입 토큰.
 *
 * `Symbol`인 이유는 interface가 런타임에 남지 않아서다. 문자열 토큰은 다른 모듈이 같은
 * 문자열을 쓰면 조용히 충돌하지만 `Symbol`은 참조 동일성으로만 식별된다.
 */
export const HEALTH = Symbol('HEALTH');
