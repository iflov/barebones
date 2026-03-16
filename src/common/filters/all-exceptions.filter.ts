import { ArgumentsHost, Catch, type ExceptionFilter, HttpException } from '@nestjs/common';
import type { Response } from 'express';
import { Logger } from 'nestjs-pino';

type HttpExceptionResponse =
  | string
  | {
      error?: string;
      message?: string | string[];
    };

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger?: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const message =
      exception instanceof HttpException ? this.extractMessage(exception) : 'Internal server error';

    if (!(exception instanceof HttpException)) {
      this.logger?.error({ err: exception }, 'Unhandled exception');
    }

    response.status(status).json({
      code: status,
      message,
      data: null,
    });
  }

  private extractMessage(exception: HttpException): string {
    const exceptionResponse = exception.getResponse() as HttpExceptionResponse;

    if (typeof exceptionResponse === 'string') {
      return exceptionResponse;
    }

    if (Array.isArray(exceptionResponse.message)) {
      return exceptionResponse.message.join(', ');
    }

    return exceptionResponse.message ?? exception.message;
  }
}
