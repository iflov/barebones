import 'reflect-metadata';
// ⚠ 이 import는 './app.module'보다 **위에 있어야 한다.** import는 순서대로 평가되고,
// app.module.ts의 모듈 본문이 그 시점에 process.env를 읽어 feature flag를 결정한다.
// 순서가 뒤바뀌면 `.env` 파일의 플래그가 무시되고 모듈이 조용히 빠진다 (load-env.ts 참고).
import './config/load-env';

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { configureHttpApp } from './app.setup';
import { featureFlags } from './config/feature-flags';
import { loadedEnvFiles } from './config/load-env';

const SHUTDOWN_SIGNALS: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

async function bootstrap(): Promise<void> {
  // bufferLogs: pino 로거가 DI에서 준비되기 전의 부팅 로그를 버려지지 않게 모아둔다.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  configureHttpApp(app);

  const configService = app.get(ConfigService);
  const logger = app.get(Logger);
  const port = configService.get<number>('APP_PORT') ?? 3000;
  const nodeEnv = configService.get<string>('NODE_ENV') ?? 'test';
  const shutdownTimeoutMs = configService.get<number>('APP_SHUTDOWN_TIMEOUT_MS') ?? 10_000;

  registerGracefulShutdown(app, logger, shutdownTimeoutMs);

  await app.listen(port);

  logger.log(`${nodeEnv} API listening on port ${port}`);
  logBootConfiguration(logger);
}

/**
 * 무엇이 켜졌는지 부팅 시점에 드러낸다.
 *
 * feature flag는 `.env` 로딩 순서에 의존해서 결정되므로(load-env.ts), 잘못되면
 * **모듈만 조용히 빠진 채 앱은 정상 부팅한다.** "레디스는 되는데 메트릭만 404" 같은 증상으로
 * 나타나서 원인을 찾기 어렵다. 조용한 실패를 시끄러운 실패로 바꾸는 것이 이 로그의 목적이다
 * (constitution E-1).
 *
 * 읽힌 `.env` 파일 목록을 같이 남기는 이유: 플래그가 기대와 다를 때 "파일을 못 읽은 것"과
 * "값이 그렇게 적혀 있는 것"을 구분해야 한다.
 */
function logBootConfiguration(logger: Logger): void {
  const envFiles = loadedEnvFiles.length === 0 ? 'none (OS env only)' : loadedEnvFiles.join(', ');

  logger.log(
    `Boot config — redis=${featureFlags.redis} bullmq=${featureFlags.bullmq} ` +
      `metrics=${featureFlags.metrics} mongodb=${featureFlags.mongodb} | env files: ${envFiles}`,
  );
}

/**
 * graceful shutdown.
 *
 * `app.close()`가 모듈 정리(`onModuleDestroy` / `onApplicationShutdown`)와 커넥션 해제를 맡고,
 * 여기서는 **in-flight 요청이 끝날 때까지 기다리되 timeout을 넘기면 강제 종료**한다.
 * 타임아웃이 없으면 끊기지 않는 커넥션 하나 때문에 프로세스가 영원히 남고,
 * 오케스트레이터가 결국 SIGKILL로 죽인다 — 그때는 정리 코드가 아예 실행되지 않는다.
 *
 * `app.setup.ts`에서 `enableShutdownHooks()`를 부르지 않는 이유: Nest 기본 리스너와
 * 여기 리스너가 둘 다 등록되면 같은 시그널에 `close()`가 두 번 호출된다.
 *
 * `forceExit.unref()`는 이 타이머가 이벤트 루프를 붙잡지 않게 한다. unref하지 않으면
 * 정상 종료 경로에서도 타이머 때문에 프로세스가 timeout만큼 더 살아 있다.
 * unref된 타이머도 루프가 살아 있는 동안에는 정상적으로 발화하므로 백스톱 역할은 유지된다.
 *
 * ⚠ 정상 경로에서 `process.exit()`을 부르지 않는다. pino transport(Loki 전송 등)는
 * 워커 스레드에서 비동기로 flush하는데, `exit()`은 그 큐를 기다리지 않아서
 * **방금 남긴 종료 로그가 유실된다** — 배포 실패를 사후 분석할 때 가장 필요한 줄이 그것이다.
 * 대신 `process.exitCode`만 정하고 이벤트 루프가 비면 자연 종료되게 둔다 (constitution E-1).
 * 강제 종료(타임아웃)는 정의상 하드 킬이라 그때만 `exit()`을 쓴다.
 */
function registerGracefulShutdown(
  app: Awaited<ReturnType<typeof NestFactory.create>>,
  logger: Logger,
  timeoutMs: number,
): void {
  let shuttingDown = false;

  for (const signal of SHUTDOWN_SIGNALS) {
    process.on(signal, () => {
      // 같은 시그널이 두 번 오거나 SIGINT/SIGTERM이 연달아 와도 한 번만 처리한다.
      if (shuttingDown) {
        return;
      }

      shuttingDown = true;
      logger.log(`${signal} received. Draining in-flight requests (timeout ${timeoutMs}ms).`);

      const forceExit = setTimeout(() => {
        logger.error('Graceful shutdown timed out. Forcing exit.');
        process.exit(1);
      }, timeoutMs);

      forceExit.unref();

      void app
        .close()
        .then(() => {
          clearTimeout(forceExit);
          logger.log('Shutdown complete.');
        })
        .catch((error: unknown) => {
          clearTimeout(forceExit);
          logger.error({ err: error }, 'Shutdown failed.');
          process.exitCode = 1;
        });
    });
  }
}

void bootstrap();
