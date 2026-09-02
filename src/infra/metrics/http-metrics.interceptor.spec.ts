import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import { Registry } from '@prometheus-io/client';
import { lastValueFrom, of, Subject, throwError } from 'rxjs';

import { MetricsInterceptor } from './http-metrics.interceptor.js';

describe('MetricsInterceptor', () => {
  function createContext(
    routePath: string | undefined,
    responseStatusCode = 200,
  ): ExecutionContext {
    const request = {
      baseUrl: '/v1/system/items',
      method: 'GET',
      route: routePath === undefined ? undefined : { path: routePath },
    };
    const response = {
      statusCode: responseStatusCode,
    };

    return {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as ExecutionContext;
  }

  function createInterceptor(prefix = 'app_test_') {
    const registry = new Registry();
    const metricsService = {
      getPrefix: () => prefix,
      getRegistry: () => registry,
    };

    return {
      interceptor: new MetricsInterceptor(metricsService as never),
      registry,
    };
  }

  it('records duration labels for successful requests', async () => {
    const { interceptor, registry } = createInterceptor();
    const context = createContext('/:id', 204);
    const next: CallHandler = {
      handle: () => of({ ok: true }),
    };

    await lastValueFrom(interceptor.intercept(context, next));

    const metrics = await registry.metrics();

    expect(metrics).toContain('app_test_http_request_duration_seconds_count');
    expect(metrics).toContain('method="GET",route="/v1/system/items/:id",status_code="204"');
    expect(metrics).toContain('app_test_http_active_requests 0');
  });

  it('records UNKNOWN for requests without a resolved route', async () => {
    const { interceptor, registry } = createInterceptor();
    const context = createContext(undefined, 200);
    const next: CallHandler = {
      handle: () => of({ ok: true }),
    };

    await lastValueFrom(interceptor.intercept(context, next));

    const metrics = await registry.metrics();

    expect(metrics).toContain('route="UNKNOWN"');
  });

  it('tracks active requests during in-flight work', async () => {
    const { interceptor, registry } = createInterceptor();
    const context = createContext('/:id', 200);
    const subject = new Subject<{ ok: true }>();
    const next: CallHandler = {
      handle: () => subject.asObservable(),
    };

    const result = lastValueFrom(interceptor.intercept(context, next));
    const activeGauge = await registry.getSingleMetric('app_test_http_active_requests')?.get();

    expect(activeGauge?.values[0]?.value).toBe(1);

    subject.next({ ok: true });
    subject.complete();
    await result;

    const settledGauge = await registry.getSingleMetric('app_test_http_active_requests')?.get();

    expect(settledGauge?.values[0]?.value).toBe(0);
  });

  it('records error responses with their status code', async () => {
    const { interceptor, registry } = createInterceptor();
    const context = createContext('/:id', 500);
    const next: CallHandler = {
      handle: () => throwError(() => new HttpException('bad request', 400)),
    };

    await expect(lastValueFrom(interceptor.intercept(context, next))).rejects.toThrow(
      'bad request',
    );

    const metrics = await registry.metrics();

    expect(metrics).toContain('status_code="400"');
  });
});
