import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import type { ConfigService } from '@nestjs/config';

export const CORS_WILDCARD = '*';

/**
 * `CORS_ORIGINS` 문자열 → origin 목록.
 *
 * **검증과 소비가 같은 파서를 쓴다** (constitution A-3). 예전에는 Joi가 원문 문자열을
 * `invalid('*')`로만 검사하고 런타임은 split한 목록을 봤다. 그래서
 * `CORS_ORIGINS='https://app.example.com,*'`나 공백이 붙은 `' * '`가 production 검증을
 * 통과한 뒤 전체 origin 허용이 됐다. 검증은 **소비하는 형태**를 대상으로 해야 한다.
 */
export function parseCorsOrigins(raw: string): string[] {
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export function hasWildcardOrigin(raw: string): boolean {
  return parseCorsOrigins(raw).includes(CORS_WILDCARD);
}

function isTruthy(value: string | boolean | undefined): boolean {
  return value === true || value === 'true';
}

/**
 * CORS 옵션.
 *
 * `CORS_ORIGINS`에 `*`가 하나라도 있으면 전체 허용이다.
 * production에서는 `env.validation.ts`가 부팅 시점에 거부한다.
 *
 * **CORS는 보안 경계가 아니다.** 브라우저가 지키는 규칙일 뿐이라 서버 간 호출이나
 * curl에는 아무 영향이 없다. 인증·인가를 대신하지 않는다.
 *
 * ⚠ `origin: true`는 요청 origin을 그대로 반사한다. `credentials: true`와 함께 쓰면
 * 사실상 "모든 사이트에서 credential 동반 요청 허용"이 된다. 개발 편의를 위한
 * 기본값이며, production에서 이 조합이 불가능하도록 막는 것이 검증 규칙의 목적이다.
 */
export function buildCorsOptions(configService: ConfigService): CorsOptions {
  const rawOrigins = configService.get<string>('CORS_ORIGINS') ?? CORS_WILDCARD;
  const origins = parseCorsOrigins(rawOrigins);

  return {
    allowedHeaders: ['Content-Type', 'X-Request-Id', 'X-Requested-With'],
    credentials: isTruthy(configService.get<string | boolean>('CORS_CREDENTIALS')),
    exposedHeaders: ['X-Request-Id'],
    maxAge: 86_400,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    origin: origins.includes(CORS_WILDCARD) ? true : origins,
  };
}
