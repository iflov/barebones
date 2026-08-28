import { isFeatureEnabled } from './redis.config.js';

/**
 * 모듈을 켜고 끄는 플래그.
 *
 * **이 값들은 DI 컨테이너가 만들어지기 전에 결정된다** — `app.module.ts`가 `imports` 배열을
 * 구성하는 시점에 필요하고, 그때는 `ConfigService`가 아직 없다 (constitution A-3 예외 1).
 * 그래서 `process.env`를 직접 읽는다.
 *
 * ⚠ 그 대가로 **`.env` 파일이 이미 로드돼 있어야 한다.** `main.ts`가 `./config/load-env`를
 * `AppModule`보다 먼저 import하는 이유가 그것이다. 로드 전에 이 모듈이 평가되면
 * 플래그는 OS 환경변수만 보고 결정되고, 모듈이 **조용히 빠진 채로** 앱이 정상 부팅한다.
 * 그 상태를 드러내기 위해 `main.ts`가 부팅 시점에 결정된 값을 로그로 남긴다.
 */
export interface FeatureFlags {
  readonly bullmq: boolean;
  readonly metrics: boolean;
  readonly mongodb: boolean;
  readonly redis: boolean;
}

export function resolveFeatureFlags(env: NodeJS.ProcessEnv = process.env): FeatureFlags {
  return {
    bullmq: isFeatureEnabled(env.BULLMQ_ENABLED),
    metrics: isFeatureEnabled(env.PROMETHEUS_ENABLED),
    mongodb: isFeatureEnabled(env.MONGODB_ENABLED),
    redis: isFeatureEnabled(env.REDIS_ENABLED),
  };
}

/** 앱 전체가 공유하는 단일 값. 두 번 계산하면 로그와 실제가 어긋날 수 있다. */
export const featureFlags = resolveFeatureFlags();
