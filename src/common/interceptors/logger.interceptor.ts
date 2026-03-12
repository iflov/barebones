import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { Logger } from 'nestjs-pino';
import { Observable } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: Logger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() === 'http') {
      return this.logHttpCall(context, next);
    }
    return next.handle();
  }

  private logHttpCall(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const userAgent = request.get('user-agent') ?? '';
    const { ip, method, path: url } = request;
    const correlationKey = uuidv4();
    const userId = (request as Request & { user?: { userId?: string } }).user?.userId;

    this.logger.log(
      `[${correlationKey}] ${method} ${url} ${userId ?? 'anonymous'} ${userAgent} ${ip}: ${context.getClass().name} ${context.getHandler().name}`,
    );

    const now = Date.now();
    return next.handle().pipe(
      tap(() => {
        const response = context.switchToHttp().getResponse<Response>();
        const statusCode = response.statusCode;
        const contentLength = response.get('content-length') ?? '-';
        const logData = `[${correlationKey}] ${method} ${url} ${String(statusCode)} ${contentLength}: ${String(Date.now() - now)}ms`;

        this.logger.log(logData);
      }),
      catchError((error: Error) => {
        const elapsed = Date.now() - now;
        const logData = `[${correlationKey}] ${method} ${url} ERROR: ${String(elapsed)}ms - ${error.message}`;

        this.logger.error(logData);
        throw error;
      }),
    );
  }
}
