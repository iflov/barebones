import {
  parseScaffoldConfig,
  scaffoldConsistencyIssues,
  type ScaffoldState,
  typeOrmMigrationConsistencyIssues,
} from './scaffold.config.js';

function typeOrmPostgresState(): ScaffoldState {
  return {
    activeScaffoldSource: "database: 'postgres', orm: 'typeorm'",
    appModuleSource: 'imports: [RdbDatabaseModule]',
    composeSource: 'image: postgres:17-alpine',
    dependencies: new Set(['@nestjs/typeorm', 'pg', 'typeorm']),
    devDependencies: new Set(),
    envExampleSource: 'DB_TYPE=postgres',
    files: new Set([
      'src/common/persistence/typeorm-repository.adapter.ts',
      'src/config/typeorm-data-source.ts',
      'src/infra/rdb/rdb-database.module.ts',
    ]),
    rdbModuleSource: 'TypeOrmModule.forRootAsync({})',
  };
}

describe('scaffold config', () => {
  it('parses an ORM and database selected at project creation time', () => {
    expect(parseScaffoldConfig({ rdb: { database: 'postgres', orm: 'typeorm' } })).toEqual({
      rdb: { database: 'postgres', orm: 'typeorm' },
    });
  });

  it.each([
    [{}, 'rdb must contain an object'],
    [
      { rdb: { database: 'oracle', orm: 'typeorm' } },
      'rdb.database must be one of: postgres, mysql, mariadb',
    ],
    [
      { rdb: { database: 'postgres', orm: 'sequelize' } },
      'rdb.orm must be one of: typeorm, prisma, mikroorm, drizzle',
    ],
  ])('rejects an invalid selection', (input, message) => {
    expect(() => parseScaffoldConfig(input)).toThrow(message);
  });

  it('accepts the selected TypeORM/PostgreSQL materialization', () => {
    const config = parseScaffoldConfig({ rdb: { database: 'postgres', orm: 'typeorm' } });

    expect(scaffoldConsistencyIssues(config, typeOrmPostgresState())).toEqual([]);
  });

  it('detects a missing selected ORM driver', () => {
    const config = parseScaffoldConfig({ rdb: { database: 'postgres', orm: 'typeorm' } });
    const current = typeOrmPostgresState();
    const state: ScaffoldState = {
      activeScaffoldSource: current.activeScaffoldSource,
      appModuleSource: current.appModuleSource,
      composeSource: current.composeSource,
      dependencies: new Set(['@nestjs/typeorm', 'typeorm']),
      devDependencies: current.devDependencies,
      envExampleSource: current.envExampleSource,
      files: current.files,
      rdbModuleSource: current.rdbModuleSource,
    };

    expect(scaffoldConsistencyIssues(config, state)).toContain(
      'missing database driver for typeorm/postgres: pg',
    );
  });

  it('detects an unselected database driver left installed', () => {
    const config = parseScaffoldConfig({ rdb: { database: 'postgres', orm: 'typeorm' } });
    const current = typeOrmPostgresState();
    const state: ScaffoldState = {
      activeScaffoldSource: current.activeScaffoldSource,
      appModuleSource: current.appModuleSource,
      composeSource: current.composeSource,
      dependencies: new Set(['@nestjs/typeorm', 'mysql2', 'pg', 'typeorm']),
      devDependencies: current.devDependencies,
      envExampleSource: current.envExampleSource,
      files: current.files,
      rdbModuleSource: current.rdbModuleSource,
    };

    expect(scaffoldConsistencyIssues(config, state)).toContain(
      'unselected database driver is still installed: mysql2',
    );
  });

  it('detects an unselected ORM left active in the RDB composition root', () => {
    const config = parseScaffoldConfig({ rdb: { database: 'postgres', orm: 'typeorm' } });
    const current = typeOrmPostgresState();
    const state: ScaffoldState = {
      activeScaffoldSource: current.activeScaffoldSource,
      appModuleSource: current.appModuleSource,
      composeSource: current.composeSource,
      dependencies: current.dependencies,
      devDependencies: current.devDependencies,
      envExampleSource: current.envExampleSource,
      files: current.files,
      rdbModuleSource: `${current.rdbModuleSource}\nPrismaClient`,
    };

    expect(scaffoldConsistencyIssues(config, state)).toContain(
      'RdbDatabaseModule also activates unselected ORM: prisma',
    );
  });

  it('detects a Docker database that differs from the selection', () => {
    const config = parseScaffoldConfig({ rdb: { database: 'mysql', orm: 'typeorm' } });
    const current = typeOrmPostgresState();

    expect(scaffoldConsistencyIssues(config, current)).toEqual(
      expect.arrayContaining([
        'missing database driver for typeorm/mysql: mysql2',
        '.env.example DB_TYPE does not match selected database: mysql',
        'docker-compose.yml does not provide selected database: mysql',
      ]),
    );
  });
});

describe('TypeORM migration consistency', () => {
  const config = parseScaffoldConfig({ rdb: { database: 'postgres', orm: 'typeorm' } });
  const selfLocatingConfig = `
    fileURLToPath(import.meta.url)
    ../database/migrations/*{.ts,.js}
  `;

  it('accepts an empty source and build migration directory', () => {
    expect(
      typeOrmMigrationConsistencyIssues(config, {
        builtMigrationFiles: [],
        databaseConfigSource: selfLocatingConfig,
        sourceMigrationFiles: ['.gitkeep'],
      }),
    ).toEqual([]);
  });

  it('rejects a CWD-relative migration glob even when there are no migrations', () => {
    expect(
      typeOrmMigrationConsistencyIssues(config, {
        databaseConfigSource: "const MIGRATIONS = ['src/database/migrations/*{.ts,.js}']",
        sourceMigrationFiles: ['.gitkeep'],
      }),
    ).toContain('TypeORM migrations must use a self-locating import.meta.url glob');
  });

  it('rejects a migration omitted from the build output', () => {
    expect(
      typeOrmMigrationConsistencyIssues(config, {
        builtMigrationFiles: [],
        databaseConfigSource: selfLocatingConfig,
        sourceMigrationFiles: ['1787900000000-CreateWidget.ts'],
      }),
    ).toContain(
      'compiled TypeORM migrations do not match source: source=[1787900000000-CreateWidget] built=[]',
    );
  });
});
