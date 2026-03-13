import type { ArgumentsHost } from '@nestjs/common';
import { HttpException } from '@nestjs/common';

import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
  });

  function createHost() {
    const response = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };

    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
      }),
    } as ArgumentsHost;

    return { host, response };
  }

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
});
