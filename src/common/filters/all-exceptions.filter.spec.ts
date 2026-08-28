import type { ArgumentsHost } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import type { Logger } from 'nestjs-pino';

import { AllExceptionsFilter } from './all-exceptions.filter.js';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let logger: Pick<Logger, 'error'>;

  beforeEach(() => {
    logger = {
      error: vi.fn(),
    };
    filter = new AllExceptionsFilter(logger as Logger);
  });

  function createHost(headersSent = false) {
    const response = {
      headersSent,
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    };

    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
      }),
    } as ArgumentsHost;

    return { host, response };
  }

  /**
   * HTTP 응답은 ① 상태코드+헤더 → ② 본문 순으로 나가고, ①이 나가면 되돌릴 수 없다.
   * 스트리밍성 응답(`/v1/system/metrics`) 중간에 에러가 나면 여기서 `status()`를 다시 부르는
   * 순간 Node가 `ERR_HTTP_HEADERS_SENT`를 던지고 **진짜 원인이 그 에러에 가려진다.**
   */
  describe('응답이 이미 시작된 경우', () => {
    it('헤더가 나갔으면 응답을 다시 쓰지 않는다', () => {
      const { host, response } = createHost(true);

      filter.catch(new Error('boom'), host);

      expect(response.status).not.toHaveBeenCalled();
      expect(response.json).not.toHaveBeenCalled();
    });

    it('그래도 로그는 남긴다 (조용히 사라지면 안 된다)', () => {
      const { host } = createHost(true);
      const exception = new Error('boom');

      filter.catch(exception, host);

      expect(logger.error).toHaveBeenCalledWith({ err: exception }, 'Unhandled exception');
    });
  });

  it('returns the exception string response in the standard error envelope', () => {
    const { host, response } = createHost();
    const exception = new HttpException('Forbidden', 403);

    filter.catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith({
      code: 403,
      data: null,
      message: 'Forbidden',
    });
  });

  it('joins array messages into a single string', () => {
    const { host, response } = createHost();
    const exception = new HttpException(
      {
        message: ['name is required', 'email must be valid'],
      },
      400,
    );

    filter.catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      code: 400,
      data: null,
      message: 'name is required, email must be valid',
    });
  });

  it('falls back to exception.message when the response payload has no message', () => {
    const { host, response } = createHost();
    const exception = new HttpException({ error: 'Internal Server Error' }, 500);

    filter.catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      code: 500,
      data: null,
      message: exception.message,
    });
  });

  it('returns a generic 500 envelope for Error instances and logs the details', () => {
    const { host, response } = createHost();
    const exception = new Error('database connection blew up');

    filter.catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      code: 500,
      data: null,
      message: 'Internal server error',
    });
    expect(logger.error).toHaveBeenCalledWith({ err: exception }, 'Unhandled exception');
  });

  it('returns a generic 500 envelope for unknown thrown values without leaking details', () => {
    const { host, response } = createHost();

    filter.catch('boom', host);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      code: 500,
      data: null,
      message: 'Internal server error',
    });
    expect(logger.error).toHaveBeenCalledWith({ err: 'boom' }, 'Unhandled exception');
  });
});
