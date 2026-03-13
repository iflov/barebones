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
      path: '/v1/admin/health',
      ...(options?.userId ? { user: { userId: options.userId } } : {}),
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

  it('binds userId when user is authenticated', async () => {
    const { context, request } = createHttpContext({ userId: 'user-123' });
    const next: CallHandler = { handle: () => of({ status: 'ok' }) };

    await lastValueFrom(interceptor.intercept(context, next));

    expect((request.log as { setBindings: jest.Mock }).setBindings).toHaveBeenCalledWith({
      handler: 'HealthController.check',
      userId: 'user-123',
    });
  });

  it('omits userId when user is not authenticated', async () => {
    const { context, request } = createHttpContext();
    const next: CallHandler = { handle: () => of({ status: 'ok' }) };

    await lastValueFrom(interceptor.intercept(context, next));

    const call = (request.log as { setBindings: jest.Mock }).setBindings.mock.calls[0][0];
    expect(call).not.toHaveProperty('userId');
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
