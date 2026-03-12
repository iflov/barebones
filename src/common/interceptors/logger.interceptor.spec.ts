import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';

import { LoggingInterceptor } from './logger.interceptor';

jest.mock('uuid', () => ({
  v4: () => 'test-correlation-id',
}));

describe('LoggingInterceptor', () => {
  const logger = {
    error: jest.fn(),
    log: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function createHttpContext(responseStatusCode = 200): ExecutionContext {
    const request = {
      get: jest.fn().mockReturnValue('jest-agent'),
      ip: '127.0.0.1',
      method: 'GET',
      path: '/v1/admin/health',
    };
    const response = {
      get: jest.fn().mockReturnValue('123'),
      statusCode: responseStatusCode,
    };

    return {
      getClass: () => ({ name: 'HealthController' }),
      getHandler: () => ({ name: 'check' }),
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as ExecutionContext;
  }

  it('logs request start and completion for HTTP calls', async () => {
    const interceptor = new LoggingInterceptor(logger as never);
    const context = createHttpContext();
    const next: CallHandler = {
      handle: () => of({ status: 'ok' }),
    };

    await lastValueFrom(interceptor.intercept(context, next));

    expect(logger.log).toHaveBeenCalledTimes(2);
    expect(logger.log).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(
        'GET /v1/admin/health anonymous jest-agent 127.0.0.1: HealthController check',
      ),
    );
    expect(logger.log).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('GET /v1/admin/health 200 123:'),
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs request failures for HTTP calls', async () => {
    const interceptor = new LoggingInterceptor(logger as never);
    const context = createHttpContext(500);
    const next: CallHandler = {
      handle: () => throwError(() => new Error('boom')),
    };

    await expect(lastValueFrom(interceptor.intercept(context, next))).rejects.toThrow('boom');

    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('ERROR:'));
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('boom'));
  });
});
