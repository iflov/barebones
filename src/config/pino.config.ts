import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import type { ConfigService } from '@nestjs/config';
import dayjs from 'dayjs';
import type { Params } from 'nestjs-pino';

import { HEALTH_ROUTE_PATH, METRICS_ROUTE_PATH } from './observability.config.js';

export const REQUEST_ID_HEADER = 'X-Request-Id';

/**
 * 로그를 남기지 않는 경로.
 *
 * 오케스트레이터의 헬스체크(수십 초 간격)와 Prometheus scrape(15초 간격)를 전부 기록하면
 * 하루 로그의 상당 부분이 "헬스체크 200"이 된다. Loki 비용이 늘고 진짜 문제가 노이즈에 묻힌다.
 *
 * ⚠ **버저닝 prefix까지 포함한 실제 경로여야 한다.** `'/health'`처럼 컨트롤러 경로만 적으면
 * 실제 요청(`/v1/system/health`)과 안 맞아서 **필터가 조용히 아무것도 안 한다.**
 * 메트릭 경로는 `observability.config.json`이 소유하므로 상수에서 파생시킨다 —
 * 손으로 적으면 설정을 바꿀 때 여기가 따라오지 않는다 (constitution A-4).
 */
const NOISE_PATHS = new Set([`/v1/${HEALTH_ROUTE_PATH}`, `/v1/${METRICS_ROUTE_PATH}`]);

export function isNoisePath(url: string | undefined): boolean {
  if (url === undefined) {
    return false;
  }

  // 쿼리스트링이 붙어도 같은 경로다.
  const [path] = url.split('?');

  return NOISE_PATHS.has(path);
}

function isEnabled(value: string | boolean | undefined): boolean {
  return value === true || value === 'true';
}

/**
 * 요청 ID를 정하고 **응답 헤더로도 내보낸다**.
 *
 * 헤더로 내보내지 않으면 클라이언트가 받은 에러와 서버 로그를 연결할 수단이 없다.
 * (CORS `exposedHeaders`에 `X-Request-Id`가 있어도 아무도 그 헤더를 설정하지 않으면
 * 값은 항상 `undefined`다 — 설정만 있고 동작은 없는 상태였다.)
 *
 * 들어온 `X-Request-Id`가 있으면 그것을 이어받는다. 게이트웨이나 상위 서비스가 이미
 * 부여한 ID를 버리면 분산 추적이 요청 하나마다 끊긴다.
 */
export function resolveRequestId(request: IncomingMessage, response: ServerResponse): string {
  const inbound = request.headers['x-request-id'];
  const requestId = typeof inbound === 'string' && inbound.length > 0 ? inbound : randomUUID();

  response.setHeader(REQUEST_ID_HEADER, requestId);

  return requestId;
}

export function buildPinoConfig(configService: ConfigService): Params {
  const nodeEnv = configService.get<string>('NODE_ENV') ?? 'development';
  const lokiEnabled = isEnabled(configService.get<string | boolean>('LOG_LOKI_ENABLED'));
  const stdoutEnabled =
    isEnabled(configService.get<string | boolean>('LOG_STDOUT_ENABLED')) ||
    nodeEnv === 'development';
  const targets: Array<{ level?: string; options: Record<string, unknown>; target: string }> = [];

  if (stdoutEnabled) {
    targets.push({
      options: {
        colorize: true,
        ignore: 'pid,hostname',
        singleLine: true,
        translateTime: 'SYS:standard',
      },
      target: 'pino-pretty',
    });
  }

  if (lokiEnabled) {
    targets.push({
      options: {
        batching: true,
        host: configService.get<string>('LOKI_HOST') ?? 'http://localhost:3100',
        interval: 5,
        labels: {
          app: configService.get<string>('APP_NAME') ?? 'barebones',
          env: nodeEnv,
        },
      },
      target: 'pino-loki',
    });
  }

  const transport =
    targets.length === 0
      ? undefined
      : targets.length === 1
        ? targets[0]
        : {
            targets,
          };

  return {
    pinoHttp: {
      autoLogging: {
        ignore: (req) => isNoisePath(req.url),
      },
      customLogLevel: (_req: IncomingMessage, res: { statusCode: number }, err?: Error) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      customProps: (request: IncomingMessage & { id?: unknown; ip?: string }) => ({
        correlationId: randomUUID(),
        ip: request.ip,
        requestId:
          typeof request.id === 'string' || typeof request.id === 'number' ? request.id : undefined,
      }),
      // req.id의 출처. 응답 헤더 X-Request-Id도 여기서 함께 설정된다.
      genReqId: resolveRequestId,
      level: configService.get<string>('LOG_LEVEL') ?? 'info',
      serializers: {
        req: (req: {
          headers?: Record<string, string>;
          method?: string;
          remoteAddress?: string;
          url?: string;
        }) => ({
          method: req.method,
          url: req.url,
          userAgent: req.headers?.['user-agent'],
          remoteAddress: req.remoteAddress,
        }),
        res: (res: { headers?: Record<string, string>; statusCode?: number }) => ({
          statusCode: res.statusCode,
          contentLength: res.headers?.['content-length'],
        }),
      },
      timestamp: () => `,"timestamp":"${dayjs().toISOString()}"`,
      transport,
    },
  };
}
