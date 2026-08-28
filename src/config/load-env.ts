import { existsSync } from 'node:fs';

import { config as loadDotenv } from 'dotenv';

/**
 * `.env` 파일을 **import 시점에** 로드한다.
 *
 * ## 왜 필요한가
 *
 * `ConfigModule.forRoot({ envFilePath })`는 Nest 컨테이너가 만들어질 때 파일을 읽는다.
 * 그런데 `app.module.ts`의 **모듈 본문**(`const metricsEnabled = ...`)은 그보다 먼저,
 * 그 파일이 import되는 순간 평가된다. JS 모듈 평가 순서가 그렇다:
 *
 * ```
 * ① import 구문 전부 평가  →  ② 모듈 본문 실행  →  ③ (나중에) ConfigModule이 .env 로드
 * ```
 *
 * 그래서 모듈 조립 시점에 `process.env`를 읽는 feature flag는 **`.env` 파일 값을 못 본다.**
 * `docker compose`나 ECS에서는 값이 OS 환경변수로 주입되므로 프로세스 시작 시점에 이미
 * `process.env`에 있어서 정상 동작한다 — **`.env` 파일 경로만 조용히 깨진다.**
 *
 * ## 왜 함수 호출로는 안 되는가
 *
 * `main.ts`에서 `dotenv.config()`를 **문장으로** 부르면 항상 늦다. `import`는 호이스팅되어
 * 파일에 쓴 어떤 문장보다 먼저 평가되므로, `import { AppModule }` 한 줄에서 이미
 * `app.module.ts`가 통째로 실행된다. 그래서 **import 자체로** 로드해야 한다:
 *
 * ```ts
 * import './config/load-env.js'; // ← AppModule import보다 위
 * ```
 *
 * ## ConfigModule과 같은 목록·같은 순서를 써야 한다
 *
 * 두 벌의 로딩 경로가 생기는 것이 이 방식의 대가다. 목록이 갈라지면
 * "부팅은 됐는데 플래그만 다른" 상태가 만들어지므로 `envFilePaths()`를 양쪽이 공유한다.
 * dotenv는 이미 존재하는 `process.env` 값을 덮어쓰지 않으므로 OS 환경변수 우선순위도 같다.
 */
export function envFilePaths(nodeEnv?: string): string[] {
  return [`.env.${nodeEnv ?? process.env.NODE_ENV ?? 'development'}`, '.env'];
}

/** 실제로 읽힌 파일 경로를 돌려준다. 부팅 로그가 "무엇을 읽었는지" 말할 수 있어야 한다. */
export function loadEnvFiles(paths: string[] = envFilePaths()): string[] {
  const loaded: string[] = [];

  for (const path of paths) {
    if (!existsSync(path)) {
      continue;
    }

    loadDotenv({ path, quiet: true });
    loaded.push(path);
  }

  return loaded;
}

export const loadedEnvFiles = loadEnvFiles();
