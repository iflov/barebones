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

    // 응답이 이미 시작됐으면 손대지 않는다.
    //
    // HTTP 응답은 ① 상태코드+헤더 → ② 본문 순으로 나가고, ①이 나가면 되돌릴 수 없다.
    // 스트리밍성 응답(예: /v1/system/metrics는 prom-client가 수집하면서 쓴다)에서 헤더가
    // 먼저 나간 뒤 에러가 나면, 여기서 status()를 다시 부르는 순간 Node가
    // ERR_HTTP_HEADERS_SENT를 던지고 **진짜 원인이 그 에러에 가려진다.**
    // 위에서 로그는 이미 남겼으므로 조용히 빠지는 것이 아니다.
    if (response.headersSent) {
      return;
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
