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

  /**
   * 요청 로그에 어떤 핸들러가 처리했는지를 붙인다.
   *
   * **사용자 식별자는 여기서 붙이지 않는다.** 인증이 이 스캐폴드의 범위가 아니라
   * `request.user`가 아예 존재하지 않기 때문이다. 예전에는 `request.user?.userId`를 읽고
   * 있었는데, 인증을 붙이는 쪽이 `request.user.id`처럼 다른 필드명을 쓰면
   * **에러 없이 영원히 undefined**가 된다 — 있다고 믿었던 로그 필드가 없는 상태이고,
   * 애초에 없는 것보다 나쁘다.
   *
   * 인증을 추가할 때 여기에 바인딩을 넣고, 그때 **그 필드가 실제로 로그에 찍히는지**
   * 확인한다 (constitution D-1-M — mock으로는 증명되지 않는다).
   */
  private bindHttpContext(context: ExecutionContext): void {
    const request = context.switchToHttp().getRequest<Request & { log?: PinoLogger }>();
    const handler = `${context.getClass().name}.${context.getHandler().name}`;

    if (request.log && typeof request.log.setBindings === 'function') {
      request.log.setBindings({ handler });
    }
  }
}
