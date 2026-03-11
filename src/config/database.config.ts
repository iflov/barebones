import type { ConfigService } from '@nestjs/config';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import type { DataSourceOptions } from 'typeorm';

type SupportedDbType = 'mariadb' | 'sqljs';

export function buildTypeOrmOptions(configService: ConfigService): TypeOrmModuleOptions {
  const dbType = (configService.get<string>('DB_TYPE') ?? 'mariadb') as SupportedDbType;
  const logging = configService.get<boolean>('DB_LOGGING') ?? false;

  if (dbType === 'sqljs') {
    return {
      autoLoadEntities: true,
      logging,
      migrations: ['src/database/migrations/*{.ts,.js}'],
      synchronize: false,
      type: 'sqljs',
    };
  }

  return {
    autoLoadEntities: true,
    database: configService.get<string>('DB_DATABASE') ?? 'barebones',
    entities: [],
    host: configService.get<string>('DB_HOST') ?? 'localhost',
    logging,
    migrations: ['src/database/migrations/*{.ts,.js}'],
    password: configService.get<string>('DB_PASSWORD') ?? 'barebones',
    port: configService.get<number>('DB_PORT') ?? 3306,
    retryAttempts: 3,
    retryDelay: 1_000,
    synchronize: false,
    type: 'mariadb',
    username: configService.get<string>('DB_USERNAME') ?? 'barebones',
  };
}

export function buildDataSourceOptionsFromEnv(env: NodeJS.ProcessEnv): DataSourceOptions {
  const dbType = (env.DB_TYPE ?? 'mariadb') as SupportedDbType;
  const logging = env.DB_LOGGING === 'true';

  if (dbType === 'sqljs') {
    return {
      entities: ['src/**/*.entity{.ts,.js}'],
      logging,
      migrations: ['src/database/migrations/*{.ts,.js}'],
      synchronize: false,
      type: 'sqljs',
    };
  }

  return {
    database: env.DB_DATABASE ?? 'barebones',
    entities: ['src/**/*.entity{.ts,.js}'],
    host: env.DB_HOST ?? 'localhost',
    logging,
    migrations: ['src/database/migrations/*{.ts,.js}'],
    password: env.DB_PASSWORD ?? 'barebones',
    port: Number(env.DB_PORT ?? 3306),
    synchronize: false,
    type: 'mariadb',
    username: env.DB_USERNAME ?? 'barebones',
  };
}
