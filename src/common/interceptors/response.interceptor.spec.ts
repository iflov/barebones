import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { lastValueFrom, of } from 'rxjs';

import { ResponseInterceptor } from './response.interceptor';

describe('ResponseInterceptor', () => {
  it('wraps successful responses in the standard envelope', async () => {
    const interceptor = new ResponseInterceptor<{ status: string }>();
    const response = { statusCode: 200 };
    const context = new ExecutionContextHost([{}, response]);

    const result = await lastValueFrom(
      interceptor.intercept(context, {
        handle: () => of({ status: 'ok' }),
      }),
    );

    const envelope = result as { code: number; data: { status: string }; message: string };

    expect(envelope.code).toBe(200);
    expect(envelope.message).toBe('ok');
    expect(envelope.data).toEqual({ status: 'ok' });
  });
});
