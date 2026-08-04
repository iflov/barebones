import type { ConfigService } from '@nestjs/config';

import { buildDataSourceOptionsFromEnv, buildTypeOrmOptions } from './database.config';

function createConfigService(values: Record<string, unknown>): ConfigService {
  return {
    get: <T>(key: string) => values[key] as T,
  } as ConfigService;
}

/** `port` / `schema` 같은 필드는 드라이버별 유니온에 따라 존재 여부가 갈린다. */
function asRecord(options: unknown): Record<string, unknown> {
  return options as Record<string, unknown>;
}

describe('buildTypeOrmOptions', () => {
  it('defaults to postgres when DB_TYPE is unset', () => {
    const options = buildTypeOrmOptions(createConfigService({}));

    expect(options.type).toBe('postgres');
    expect(options.autoLoadEntities).toBe(true);
    expect(asRecord(options).port).toBe(5432);
    expect(asRecord(options).schema).toBe('public');
  });

  /** DB 교체 지점 — 코드가 아니라 이 환경변수 하나로 갈린다 (constitution A-3-D). */
  it.each([
    ['postgres', 5432],
    ['mysql', 3306],
    ['mariadb', 3306],
  ])('builds a %s config with the driver default port', (dbType, expectedPort) => {
    const options = buildTypeOrmOptions(createConfigService({ DB_TYPE: dbType }));

    expect(options.type).toBe(dbType);
    expect(asRecord(options).port).toBe(expectedPort);
  });

  it('DB_PORT가 있으면 드라이버 기본 포트를 덮어쓴다', () => {
    const options = buildTypeOrmOptions(
      createConfigService({ DB_PORT: 6543, DB_TYPE: 'postgres' }),
    );

    expect(asRecord(options).port).toBe(6543);
  });

  it('schema는 postgres에만 넘어간다 (다른 드라이버에는 없는 개념)', () => {
    const mysql = buildTypeOrmOptions(createConfigService({ DB_SCHEMA: 'app', DB_TYPE: 'mysql' }));

    expect(asRecord(mysql).schema).toBeUndefined();
  });

  /**
   * 기본값이 **검증 켜짐**이어야 한다. `rejectUnauthorized: false`는 TLS의 신원 확인을 꺼서
   * 중간자가 아무 인증서로도 끼어들 수 있게 만드는데, **연결은 정상적으로 되므로** 눈치채기 어렵다.
   */
  it('DB_SSL=true는 인증서 검증을 켠 상태로 붙는다', () => {
    const options = buildTypeOrmOptions(createConfigService({ DB_SSL: 'true' }));

    expect(asRecord(options).ssl).toEqual({ rejectUnauthorized: true });
  });

  it('DB_SSL_CA를 주면 그 CA로 검증한다', () => {
    const options = buildTypeOrmOptions(
      createConfigService({ DB_SSL: 'true', DB_SSL_CA: '-----BEGIN CERTIFICATE-----' }),
    );

    expect(asRecord(options).ssl).toEqual({
      ca: '-----BEGIN CERTIFICATE-----',
      rejectUnauthorized: true,
    });
  });

  it('빈 DB_SSL_CA는 없는 것으로 본다 (compose 기본값이 빈 문자열이다)', () => {
    const options = buildTypeOrmOptions(createConfigService({ DB_SSL: 'true', DB_SSL_CA: '' }));

    expect(asRecord(options).ssl).toEqual({ rejectUnauthorized: true });
  });

  it('검증을 끄는 것은 명시적으로만 가능하다', () => {
    const options = buildTypeOrmOptions(
      createConfigService({ DB_SSL: 'true', DB_SSL_REJECT_UNAUTHORIZED: 'false' }),
    );

    expect(asRecord(options).ssl).toEqual({ rejectUnauthorized: false });
  });

  /**
   * 끈 상태는 `undefined`다 — `ssl: false`로 명시하면 드라이버마다 해석이 갈릴 수 있고,
   * 조건부 spread로 키를 없애면 실제 객체 모양이 코드에서 안 보인다 (constitution A-3-D / A-5).
   */
  it('DB_SSL이 없으면 ssl은 undefined다', () => {
    expect(asRecord(buildTypeOrmOptions(createConfigService({}))).ssl).toBeUndefined();
  });

  it('DB_SSL이 없으면 mysql에도 ssl 값이 없다', () => {
    expect(
      asRecord(buildTypeOrmOptions(createConfigService({ DB_TYPE: 'mysql' }))).ssl,
    ).toBeUndefined();
  });

  /** constitution C-1 — 이 값이 true가 되는 변경은 금지다. */
  it('never enables synchronize for a real driver', () => {
    expect(
      asRecord(buildTypeOrmOptions(createConfigService({ DB_TYPE: 'postgres' }))).synchronize,
    ).toBe(false);
  });

  it('DB_LOGGING을 그대로 전달한다', () => {
    const options = buildTypeOrmOptions(createConfigService({ DB_LOGGING: true }));

    expect(options.logging).toBe(true);
  });

  describe('sqljs', () => {
    it('uses synchronize instead of migrations (인메모리라 이력을 쌓을 대상이 없다)', () => {
      const options = buildTypeOrmOptions(createConfigService({ DB_TYPE: 'sqljs' }));

      expect(options.type).toBe('sqljs');
      expect(asRecord(options).synchronize).toBe(true);
    });

    it('does not carry connection fields', () => {
      const options = asRecord(buildTypeOrmOptions(createConfigService({ DB_TYPE: 'sqljs' })));

      expect(options.host).toBeUndefined();
      expect(options.port).toBeUndefined();
      expect(options.ssl).toBeUndefined();
    });
  });
});

describe('buildDataSourceOptionsFromEnv', () => {
  it('defaults to postgres', () => {
    const options = buildDataSourceOptionsFromEnv({});

    expect(options.type).toBe('postgres');
    expect(asRecord(options).port).toBe(5432);
  });

  it('reads the driver from DB_TYPE', () => {
    const options = buildDataSourceOptionsFromEnv({ DB_TYPE: 'mariadb' });

    expect(options.type).toBe('mariadb');
    expect(asRecord(options).port).toBe(3306);
  });

  it('coerces DB_PORT from a string (process.env는 전부 문자열이다)', () => {
    const options = buildDataSourceOptionsFromEnv({ DB_PORT: '6543' });

    expect(asRecord(options).port).toBe(6543);
  });

  it('마이그레이션 CLI가 엔티티를 찾을 수 있도록 glob을 넘긴다', () => {
    const options = buildDataSourceOptionsFromEnv({});

    expect(options.entities).toEqual(['src/**/*.entity{.ts,.js}']);
    expect(options.migrations).toEqual(['src/database/migrations/*{.ts,.js}']);
  });

  it('DB_LOGGING은 문자열 "true"만 참으로 본다', () => {
    expect(buildDataSourceOptionsFromEnv({ DB_LOGGING: 'true' }).logging).toBe(true);
    expect(buildDataSourceOptionsFromEnv({ DB_LOGGING: '1' }).logging).toBe(false);
  });
});
