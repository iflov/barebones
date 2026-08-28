import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Gauge, Histogram } from 'prom-client';
import { Observable } from 'rxjs';
import { catchError, finalize, tap } from 'rxjs/operators';

import { normalizeHttpRoute } from './http-metrics.util.js';
import { MetricsService } from './metrics.service.js';

function resolveStatusCode(error: unknown, response: Response): string {
  if (error instanceof HttpException) {
    return String(error.getStatus());
  }

  return response.statusCode >= 400 ? String(response.statusCode) : '500';
}

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  private readonly activeRequestsGauge: Gauge<string>;
  private readonly requestDurationHistogram: Histogram<string>;

  constructor(metricsService: MetricsService) {
    const registry = metricsService.getRegistry();
    const prefix = metricsService.getPrefix();
    const activeRequestsGaugeName = `${prefix}http_active_requests`;
    const requestDurationHistogramName = `${prefix}http_request_duration_seconds`;

    this.activeRequestsGauge =
      (registry.getSingleMetric(activeRequestsGaugeName) as Gauge<string> | undefined) ??
      new Gauge({
        help: 'Number of active HTTP requests currently in flight',
        name: activeRequestsGaugeName,
        registers: [registry],
      });

    this.requestDurationHistogram =
      (registry.getSingleMetric(requestDurationHistogramName) as Histogram<string> | undefined) ??
      new Histogram({
        buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
        help: 'HTTP request duration in seconds',
        labelNames: ['method', 'route', 'status_code'],
        name: requestDurationHistogramName,
        registers: [registry],
      });
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const method = request.method || 'UNKNOWN';
    const route = normalizeHttpRoute(request);
    const startedAt = process.hrtime.bigint();

    this.activeRequestsGauge.inc();

    const observeDuration = (statusCode: string): void => {
      const elapsedNanoseconds = process.hrtime.bigint() - startedAt;

      this.requestDurationHistogram.observe(
        {
          method,
          route,
          status_code: statusCode,
        },
        Number(elapsedNanoseconds) / 1_000_000_000,
      );
    };

    return next.handle().pipe(
      tap(() => {
        observeDuration(String(response.statusCode || 200));
      }),
      catchError((error: unknown) => {
        observeDuration(resolveStatusCode(error, response));
        throw error;
      }),
      finalize(() => {
        this.activeRequestsGauge.dec();
      }),
    );
  }
}
