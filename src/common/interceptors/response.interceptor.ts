import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { map, type Observable } from 'rxjs';

import { RAW_RESPONSE_KEY } from '../decorators/raw-response.decorator';

interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiEnvelope<T | null> | T> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiEnvelope<T | null> | T> {
    const handler = typeof context.getHandler === 'function' ? context.getHandler() : undefined;
    let useRawResponse: boolean | undefined;

    try {
      useRawResponse =
        handler === undefined
          ? undefined
          : (Reflect.getMetadata(RAW_RESPONSE_KEY, handler) as boolean | undefined);
    } catch {
      useRawResponse = undefined;
    }

    const response = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      map((data) => {
        if (useRawResponse === true) {
          return data;
        }

        if (this.isApiEnvelope(data)) {
          return data;
        }

        return {
          code: response.statusCode,
          message: response.statusCode >= 400 ? 'error' : 'ok',
          data: data ?? null,
        };
      }),
    );
  }

  private isApiEnvelope(value: unknown): value is ApiEnvelope<T | null> {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    return 'code' in value && 'message' in value && 'data' in value;
  }
}
