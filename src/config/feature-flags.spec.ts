import { resolveFeatureFlags } from './feature-flags.js';

describe('resolveFeatureFlags', () => {
  it('세 플래그를 문자열에서 읽는다', () => {
    expect(
      resolveFeatureFlags({
        BULLMQ_ENABLED: 'false',
        MONGODB_ENABLED: 'true',
        PROMETHEUS_ENABLED: 'true',
        REDIS_ENABLED: 'true',
      }),
    ).toEqual({ bullmq: false, metrics: true, mongodb: true, redis: true });
  });

  /**
   * **값이 없으면 전부 꺼진다.** `isFeatureEnabled`가 `'true'`만 참으로 보기 때문이다.
   *
   * 이 동작 자체가 1번 버그의 파괴력을 결정한다 — `.env`가 늦게 로드되면 플래그는 "없음"으로
   * 읽히고, 그 결과는 "기본값으로 켜짐"이 아니라 **모듈이 전부 빠진 상태**다. 그런데도 앱은
   * 정상 부팅한다. 그래서 main.ts가 결정된 값을 로그로 남긴다 (constitution E-1).
   */
  it('값이 없으면 전부 꺼진 것으로 본다', () => {
    expect(resolveFeatureFlags({})).toEqual({
      bullmq: false,
      metrics: false,
      mongodb: false,
      redis: false,
    });
  });

  it.each(['', 'yes', '1', 'TRUE'])('%s는 켜진 것으로 보지 않는다', (value) => {
    expect(resolveFeatureFlags({ REDIS_ENABLED: value }).redis).toBe(false);
  });

  it('기본값은 process.env를 읽는다', () => {
    const previous = process.env.REDIS_ENABLED;
    process.env.REDIS_ENABLED = 'true';

    try {
      expect(resolveFeatureFlags().redis).toBe(true);
    } finally {
      if (previous === undefined) {
        delete process.env.REDIS_ENABLED;
      } else {
        process.env.REDIS_ENABLED = previous;
      }
    }
  });
});
