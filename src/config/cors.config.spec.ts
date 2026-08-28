import type { ConfigService } from '@nestjs/config';

import { buildCorsOptions, hasWildcardOrigin, parseCorsOrigins } from './cors.config.js';

function createConfigService(values: Record<string, unknown>): ConfigService {
  return {
    get: <T>(key: string) => values[key] as T,
  } as ConfigService;
}

describe('parseCorsOrigins', () => {
  it('쉼표로 나누고 공백을 제거한다', () => {
    expect(parseCorsOrigins(' https://a.com , https://b.com ')).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
  });

  it('빈 항목은 버린다 (trailing comma 등)', () => {
    expect(parseCorsOrigins('https://a.com,,')).toEqual(['https://a.com']);
  });

  it('빈 문자열은 빈 목록이다', () => {
    expect(parseCorsOrigins('   ')).toEqual([]);
  });
});

/**
 * 이 함수가 존재하는 이유가 곧 회귀 테스트다.
 *
 * 검증(Joi)이 원문 문자열만 보고 런타임이 파싱된 목록을 보던 시절에는
 * 목록 안에 섞인 `*`와 공백이 붙은 `' * '`가 production 검증을 통과한 뒤
 * 전체 origin 허용이 됐다. 검증과 소비가 같은 파서를 공유해야 막힌다.
 */
describe('hasWildcardOrigin', () => {
  it.each([
    ['*', true],
    [' * ', true],
    ['https://a.com,*', true],
    ['*,https://a.com', true],
    ['https://a.com, * ', true],
    ['https://a.com', false],
    ['https://a.com,https://b.com', false],
    ['', false],
  ])('%s -> %s', (raw, expected) => {
    expect(hasWildcardOrigin(raw)).toBe(expected);
  });
});

describe('buildCorsOptions', () => {
  it('목록을 그대로 origin 배열로 넘긴다', () => {
    const options = buildCorsOptions(
      createConfigService({ CORS_ORIGINS: 'https://a.com,https://b.com' }),
    );

    expect(options.origin).toEqual(['https://a.com', 'https://b.com']);
  });

  it.each(['*', 'https://a.com,*'])('%s가 있으면 전체 허용(true)이 된다', (raw) => {
    expect(buildCorsOptions(createConfigService({ CORS_ORIGINS: raw })).origin).toBe(true);
  });

  it('CORS_ORIGINS가 없으면 전체 허용이 기본값이다 (개발 편의)', () => {
    expect(buildCorsOptions(createConfigService({})).origin).toBe(true);
  });

  it('CORS_CREDENTIALS를 문자열에서 해석한다', () => {
    expect(buildCorsOptions(createConfigService({ CORS_CREDENTIALS: 'true' })).credentials).toBe(
      true,
    );
    expect(buildCorsOptions(createConfigService({ CORS_CREDENTIALS: 'false' })).credentials).toBe(
      false,
    );
  });

  it('X-Request-Id를 주고받을 수 있게 열어둔다 (로그와 클라이언트 리포트 연결)', () => {
    const options = buildCorsOptions(createConfigService({}));

    expect(options.exposedHeaders).toContain('X-Request-Id');
    expect(options.allowedHeaders).toContain('X-Request-Id');
  });

  it('preflight 결과를 캐시하고 메서드 목록을 명시한다', () => {
    const options = buildCorsOptions(createConfigService({}));

    expect(options.maxAge).toBe(86_400);
    expect(options.methods).toContain('OPTIONS');
  });
});
