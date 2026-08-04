import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';

import { LoggingInterceptor } from './logger.interceptor';

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;

  beforeEach(() => {
    interceptor = new LoggingInterceptor();
  });

  function createHttpContext(options?: { userId?: string }): {
    context: ExecutionContext;
    request: Record<string, unknown>;
  } {
    const request: Record<string, unknown> = {
      get: jest.fn().mockReturnValue('jest-agent'),
      ip: '127.0.0.1',
      log: {
        setBindings: jest.fn(),
      },
      method: 'GET',
      path: '/v1/system/health',
      user: options?.userId === undefined ? undefined : { userId: options.userId },
    };

    const context = {
      getClass: () => ({ name: 'HealthController' }),
      getHandler: () => ({ name: 'check' }),
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as ExecutionContext;

    return { context, request };
  }

  it('binds handler name to request.log for HTTP calls', async () => {
    const { context, request } = createHttpContext();
    const next: CallHandler = { handle: () => of({ status: 'ok' }) };

    await lastValueFrom(interceptor.intercept(context, next));

    expect((request.log as { setBindings: jest.Mock }).setBindings).toHaveBeenCalledWith({
      handler: 'HealthController.check',
    });
  });

  /**
   * 사용자 식별자는 붙이지 않는다 — 인증이 이 스캐폴드의 범위가 아니라 `request.user`가 없다.
   *
   * 예전에는 `request.user?.userId`를 읽었는데, 인증을 붙이는 쪽이 `request.user.id`처럼
   * 다른 필드명을 쓰면 **에러 없이 영원히 undefined**가 된다. 있다고 믿었던 로그 필드가
   * 없는 상태이고, 애초에 없는 것보다 나쁘다. 인증을 추가할 때 바인딩과 함께
   * 그 필드가 실제로 찍히는지 확인한다 (constitution D-1-M).
   */
  it('request.user가 있어도 사용자 정보를 바인딩하지 않는다', async () => {
    const { context, request } = createHttpContext({ userId: 'user-123' });
    const next: CallHandler = { handle: () => of({ status: 'ok' }) };

    await lastValueFrom(interceptor.intercept(context, next));

    expect((request.log as { setBindings: jest.Mock }).setBindings).toHaveBeenCalledWith({
      handler: 'HealthController.check',
    });
  });

  it('does not call logger.log() or logger.error() directly', async () => {
    const { context } = createHttpContext();
    const next: CallHandler = { handle: () => of({ status: 'ok' }) };
    const logSpy = jest.fn();
    const errorSpy = jest.fn();

    // Attach spy methods that should NOT be called
    const interceptorWithSpy = new LoggingInterceptor();
    (interceptorWithSpy as unknown as { logger: { log: jest.Mock; error: jest.Mock } }).logger = {
      log: logSpy,
      error: errorSpy,
    };

    await lastValueFrom(interceptorWithSpy.intercept(context, next));

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('passes through non-HTTP contexts without binding', async () => {
    const context = {
      getType: () => 'rpc',
    } as ExecutionContext;
    const next: CallHandler = { handle: () => of('result') };

    const result = await lastValueFrom(interceptor.intercept(context, next));

    expect(result).toBe('result');
  });

  it('handles missing request.log gracefully', async () => {
    const request: Record<string, unknown> = {
      get: jest.fn(),
      ip: '127.0.0.1',
      method: 'GET',
      path: '/test',
    };
    const context = {
      getClass: () => ({ name: 'TestController' }),
      getHandler: () => ({ name: 'test' }),
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as ExecutionContext;
    const next: CallHandler = { handle: () => of('ok') };

    const result = await lastValueFrom(interceptor.intercept(context, next));

    expect(result).toBe('ok');
  });
});
