import type { ConfigService } from '@nestjs/config';

import { buildTypeOrmOptions } from './database.config';

function createConfigService(values: Record<string, unknown>): ConfigService {
  return {
    get: <T>(key: string) => values[key] as T,
  } as ConfigService;
}

describe('buildTypeOrmOptions', () => {
  it('builds a mariadb config by default', () => {
    const config = createConfigService({
      DB_LOGGING: false,
      DB_DATABASE: 'barebones',
      DB_HOST: 'localhost',
      DB_PASSWORD: 'barebones',
      DB_PORT: 3306,
      DB_TYPE: 'mariadb',
      DB_USERNAME: 'barebones',
    });

    const options = buildTypeOrmOptions(config);

    expect(options.type).toBe('mariadb');
    expect(options.autoLoadEntities).toBe(true);
  });

  it('builds a mariadb config when requested', () => {
    const config = createConfigService({
      DB_DATABASE: 'barebones',
      DB_HOST: 'localhost',
      DB_LOGGING: true,
      DB_PASSWORD: 'secret',
      DB_PORT: 3306,
      DB_TYPE: 'mariadb',
      DB_USERNAME: 'barebones',
    });

    const options = buildTypeOrmOptions(config);

    expect(options.type).toBe('mariadb');
    expect(options.logging).toBe(true);
    if ('port' in options) {
      expect(options.port).toBe(3306);
    }
  });
});
