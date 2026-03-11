import { ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

type HttpExceptionResponse =
  | string
  | {
      error?: string;
      message?: string | string[];
    };

@Catch(HttpException)
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: HttpException, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();

    const status = exception.getStatus();
    const message = this.extractMessage(exception);

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} failed with ${status}: ${message}`,
        exception.stack,
      );
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
