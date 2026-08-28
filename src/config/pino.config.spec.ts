import type { IncomingMessage, ServerResponse } from 'node:http';

import type { ConfigService } from '@nestjs/config';
import type { Mock } from 'vitest';

import { buildPinoConfig, isNoisePath, REQUEST_ID_HEADER, resolveRequestId } from './pino.config';

function createConfigService(values: Record<string, unknown>): ConfigService {
  return {
    get: <T>(key: string) => values[key] as T,
  } as ConfigService;
}

function createRequest(headers: Record<string, string> = {}): IncomingMessage {
  return { headers } as IncomingMessage;
}

function createResponse(): { response: ServerResponse; setHeader: Mock } {
  const setHeader = vi.fn();

  return { response: { setHeader } as unknown as ServerResponse, setHeader };
}

/**
 * 응답 헤더 설정이 이 함수의 존재 이유다.
 *
 * 헤더를 내보내지 않으면 CORS `exposedHeaders`에 `X-Request-Id`가 있어도 값이 항상
 * `undefined`이고, 클라이언트가 받은 에러와 서버 로그를 연결할 수단이 없다.
 */
/**
 * 경로가 틀리면 필터가 **조용히 아무것도 안 한다.** 예전에는 `'/health'`와 비교하고 있었고
 * 실제 요청은 `/v1/system/health`라서, 헬스체크·scrape 로그가 하루 수천 줄씩 그대로 쌓였다.
 */
describe('isNoisePath', () => {
  it.each(['/v1/system/health', '/v1/system/metrics'])('%s는 로그에서 제외한다', (url) => {
    expect(isNoisePath(url)).toBe(true);
  });

  it('쿼리스트링이 붙어도 같은 경로로 본다', () => {
    expect(isNoisePath('/v1/system/health?verbose=1')).toBe(true);
  });

  it.each(['/health', '/system/health', '/v1/system/healthz', '/v1/users', undefined])(
    '%s는 제외하지 않는다',
    (url) => {
      expect(isNoisePath(url)).toBe(false);
    },
  );
});

describe('resolveRequestId', () => {
  it('요청 ID를 응답 헤더로 내보낸다', () => {
    const { response, setHeader } = createResponse();

    const requestId = resolveRequestId(createRequest(), response);

    expect(setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, requestId);
  });

  it('들어온 X-Request-Id를 이어받는다 (상위 서비스의 추적 ID를 버리지 않는다)', () => {
    const { response, setHeader } = createResponse();

    const requestId = resolveRequestId(createRequest({ 'x-request-id': 'upstream-id' }), response);

    expect(requestId).toBe('upstream-id');
    expect(setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, 'upstream-id');
  });

  it('헤더가 없으면 새로 만든다', () => {
    const { response } = createResponse();

    expect(resolveRequestId(createRequest(), response)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('빈 문자열 헤더는 무시하고 새로 만든다', () => {
    const { response } = createResponse();

    expect(
      resolveRequestId(createRequest({ 'x-request-id': '' }), response).length,
    ).toBeGreaterThan(0);
  });

  it('요청마다 다른 ID를 만든다', () => {
    const first = resolveRequestId(createRequest(), createResponse().response);
    const second = resolveRequestId(createRequest(), createResponse().response);

    expect(first).not.toBe(second);
  });
});

describe('buildPinoConfig', () => {
  it('uses app/env labels for the Loki transport', () => {
    const config = createConfigService({
      APP_NAME: 'barebones',
      LOG_LEVEL: 'debug',
      LOG_LOKI_ENABLED: true,
      LOG_STDOUT_ENABLED: false,
      LOKI_HOST: 'http://loki:3100',
      NODE_ENV: 'production',
    });

    const options = buildPinoConfig(config);
    const pinoHttp = options.pinoHttp as {
      transport?: {
        options: { host: string; labels: { app: string; env: string } };
        target: string;
      };
    };
    const transport = pinoHttp.transport as {
      options: { host: string; labels: { app: string; env: string } };
      target: string;
    };

    expect(transport.target).toBe('pino-loki');
    expect(transport.options.host).toBe('http://loki:3100');
    expect(transport.options.labels).toEqual({
      app: 'barebones',
      env: 'production',
    });
  });

  it('omits the Loki transport when disabled', () => {
    const config = createConfigService({
      LOG_LEVEL: 'info',
      LOG_LOKI_ENABLED: false,
      LOG_STDOUT_ENABLED: false,
      NODE_ENV: 'production',
    });

    const options = buildPinoConfig(config);
    const pinoHttp = options.pinoHttp as {
      transport?: unknown;
    };

    expect(pinoHttp.transport).toBeUndefined();
  });
});
