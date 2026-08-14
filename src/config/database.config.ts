import type { ConfigService } from '@nestjs/config';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import type { DataSourceOptions } from 'typeorm';

import { activeScaffold } from './active-scaffold';

/**
 * 지원 드라이버.
 *
 * 프로젝트 생성기가 선택한 드라이버만 사용한다. 런타임 DB_TYPE으로 바꾸지 않는다.
 *
 * - `postgres` → `pg`
 * - `mysql` / `mariadb` → `mysql2`
 * ORM 자체를 바꾸는 것은 이 스위치가 아니라 `src/common/persistence/`의
 * 어댑터를 교체하는 일이다 (A-1-P).
 */
export type SupportedDbType = 'postgres' | 'mysql' | 'mariadb';

const DEFAULT_PORT_BY_TYPE: Record<SupportedDbType, number> = {
  mariadb: 3306,
  mysql: 3306,
  postgres: 5432,
};

const MIGRATIONS = ['src/database/migrations/*{.ts,.js}'];

function isTruthy(value: string | boolean | undefined): boolean {
  return value === true || value === 'true';
}

interface SslOptions {
  ca: string | undefined;
  rejectUnauthorized: boolean;
}

/**
 * TLS 옵션.
 *
 * **`rejectUnauthorized`의 기본값은 `true`다.** TLS는 두 가지를 보장한다 —
 * ① 암호화(중간에서 내용을 못 읽음) ② 신원 확인(연결한 상대가 진짜 그 서버인지).
 * `rejectUnauthorized: false`는 **②만 끈다.** 그러면 중간자가 아무 인증서나 내밀어도
 * 앱이 확인하지 않고 연결하고, 공격자는 앱과 DB 양쪽에 정상 TLS를 맺어 중계한다.
 * **양쪽 다 암호화돼 있는데 공격자는 전부 평문으로 본다** — DB 비밀번호, 모든 쿼리, 모든 데이터.
 * 자물쇠는 채웠는데 열쇠를 아무에게나 준 것이고, **작동은 하므로 아무도 눈치채지 못한다.**
 *
 * 그래서 검증을 끄는 것은 **명시적 선택**이어야 하고(`DB_SSL_REJECT_UNAUTHORIZED=false`),
 * production에서는 `env.validation.ts`가 그 값을 거부한다.
 *
 * 관리형 DB(RDS 등)는 CA 번들을 공개하므로 `DB_SSL_CA`에 PEM을 넣으면 검증을 켠 채로 붙는다.
 */
function buildSslOptions(read: (key: string) => string | undefined): SslOptions {
  const ca = read('DB_SSL_CA');

  return {
    // 빈 문자열은 "없음"이다 (compose 기본값이 빈 문자열이다).
    ca: ca === undefined || ca === '' ? undefined : ca,
    rejectUnauthorized: read('DB_SSL_REJECT_UNAUTHORIZED') !== 'false',
  };
}

export function buildTypeOrmOptions(configService: ConfigService): TypeOrmModuleOptions {
  const dbType = activeScaffold.rdb.database;
  const logging = configService.get<boolean>('DB_LOGGING') ?? false;

  const read = (key: string): string | undefined => configService.get<string>(key);

  return {
    autoLoadEntities: true,
    database: configService.get<string>('DB_DATABASE') ?? 'app',
    host: configService.get<string>('DB_HOST') ?? 'localhost',
    logging,
    migrations: MIGRATIONS,
    password: configService.get<string>('DB_PASSWORD') ?? 'app',
    port: configService.get<number>('DB_PORT') ?? DEFAULT_PORT_BY_TYPE[dbType],
    retryAttempts: 3,
    retryDelay: 1_000,
    // 드라이버 전용/선택 옵션은 켜졌을 때만 값이 있다 (constitution A-3-D).
    // schema는 postgres에만 있는 개념이고, ssl은 켰을 때만 의미가 있다.
    // 끈 상태는 `undefined`로 둔다 — `ssl: false`로 명시하면 드라이버마다 해석이 갈릴 수 있고,
    // 조건부 spread로 키를 없애면 실제 객체 모양이 코드에서 안 보인다 (A-5).
    schema:
      dbType === 'postgres' ? (configService.get<string>('DB_SCHEMA') ?? 'public') : undefined,
    ssl: isTruthy(configService.get<string | boolean>('DB_SSL'))
      ? buildSslOptions(read)
      : undefined,
    // synchronize는 항상 꺼져 있다. 켜는 변경은 금지한다 (constitution C-1).
    synchronize: false,
    type: dbType,
    username: configService.get<string>('DB_USERNAME') ?? 'app',
  };
}

/**
 * 마이그레이션 CLI용 DataSource 옵션.
 *
 * `ConfigService`가 없는 실행 경로(typeorm CLI)라 `process.env`를 직접 읽는다.
 * A-3의 예외이며, **런타임 로직에는 적용되지 않는다.**
 */
export function buildDataSourceOptionsFromEnv(env: NodeJS.ProcessEnv): DataSourceOptions {
  const dbType = activeScaffold.rdb.database;
  const logging = env.DB_LOGGING === 'true';
  const entities = ['src/**/*.entity{.ts,.js}'];

  return {
    database: env.DB_DATABASE ?? 'app',
    entities,
    host: env.DB_HOST ?? 'localhost',
    logging,
    migrations: MIGRATIONS,
    password: env.DB_PASSWORD ?? 'app',
    port: Number(env.DB_PORT ?? DEFAULT_PORT_BY_TYPE[dbType]),
    schema: dbType === 'postgres' ? (env.DB_SCHEMA ?? 'public') : undefined,
    ssl: env.DB_SSL === 'true' ? buildSslOptions((key) => env[key]) : undefined,
    synchronize: false,
    type: dbType,
    username: env.DB_USERNAME ?? 'app',
  };
}
