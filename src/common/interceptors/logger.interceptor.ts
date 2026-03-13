import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request } from 'express';
import type { Logger as PinoLogger } from 'pino';
import { Observable } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() === 'http') {
      this.bindHttpContext(context);
    }
    return next.handle();
  }

  private bindHttpContext(context: ExecutionContext): void {
    const request = context
      .switchToHttp()
      .getRequest<Request & { log?: PinoLogger; user?: { userId?: string } }>();
    const handler = `${context.getClass().name}.${context.getHandler().name}`;
    const userId = request.user?.userId;

    if (request.log && typeof request.log.setBindings === 'function') {
      request.log.setBindings({
        handler,
        ...(userId !== undefined ? { userId } : {}),
      });
    }
  }
}
