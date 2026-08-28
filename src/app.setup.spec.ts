import type { INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Mock } from 'vitest';

import { configureTrustProxy } from './app.setup';

function createConfigService(values: Record<string, unknown>): ConfigService {
  return {
    get: <T>(key: string) => values[key] as T,
  } as ConfigService;
}

function createApp(): { app: INestApplication; set: Mock } {
  const set = vi.fn();

  return {
    app: {
      getHttpAdapter: () => ({ getInstance: () => ({ set }) }),
    } as unknown as INestApplication,
    set,
  };
}

/**
 * 프록시 뒤에서 `req.ip`가 프록시 주소로 고정되면 `ThrottlerGuard`가 **모든 사용자를
 * 한 버킷에** 넣는다. `THROTTLE_LIMIT`이 전체 합산이 되어 한 명이 시끄러우면 전원 429다.
 */
describe('configureTrustProxy', () => {
  it('홉 수를 그대로 설정한다', () => {
    const { app, set } = createApp();

    configureTrustProxy(app, createConfigService({ TRUST_PROXY_HOPS: 2 }));

    expect(set).toHaveBeenCalledWith('trust proxy', 2);
  });

  it('기본값(0)에서는 아무것도 설정하지 않는다 — 로컬에서 XFF를 믿을 이유가 없다', () => {
    const { app, set } = createApp();

    configureTrustProxy(app, createConfigService({}));

    expect(set).not.toHaveBeenCalled();
  });

  it('0으로 명시해도 설정하지 않는다', () => {
    const { app, set } = createApp();

    configureTrustProxy(app, createConfigService({ TRUST_PROXY_HOPS: 0 }));

    expect(set).not.toHaveBeenCalled();
  });

  /**
   * `true`(전부 신뢰)를 만들 경로가 없어야 한다. 클라이언트가 X-Forwarded-For를 위조해
   * 매 요청 다른 IP를 주장하면 rate limit을 무한 우회할 수 있다.
   */
  it('숫자 외의 값으로 trust proxy를 켤 수 없다', () => {
    const { app, set } = createApp();

    configureTrustProxy(app, createConfigService({ TRUST_PROXY_HOPS: 'true' }));

    expect(set).not.toHaveBeenCalled();
  });
});
