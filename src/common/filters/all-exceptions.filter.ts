import { ArgumentsHost, Catch, type ExceptionFilter, HttpException } from '@nestjs/common';
import type { Response } from 'express';

type HttpExceptionResponse =
  | string
  | {
      error?: string;
      message?: string | string[];
    };

@Catch(HttpException)
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();

    const status = exception.getStatus();
    const message = this.extractMessage(exception);

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
