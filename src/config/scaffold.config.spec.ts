import {
  parseScaffoldConfig,
  scaffoldConsistencyIssues,
  type ScaffoldState,
  scaffoldTemplateEsmIssues,
  typeOrmMigrationConsistencyIssues,
} from './scaffold.config.js';

describe('scaffold template ESM imports', () => {
  it('rejects extensionless relative import and export specifiers', () => {
    expect(
      scaffoldTemplateEsmIssues([
        {
          path: 'scaffold/example.ts.template',
          source: [
            "import './setup';",
            "import { dependency } from './dependency.js';",
            "import { probe } from '../rdb-health-probe.port';",
            "export { value } from '../value';",
          ].join('\n'),
        },
      ]),
    ).toEqual([
      'scaffold/example.ts.template:1 relative ESM specifier must include an extension: ./setup',
      'scaffold/example.ts.template:3 relative ESM specifier must include an extension: ../rdb-health-probe.port',
      'scaffold/example.ts.template:4 relative ESM specifier must include an extension: ../value',
    ]);
  });

  it('accepts an empty template set and non-relative package imports', () => {
    expect(scaffoldTemplateEsmIssues([])).toEqual([]);
    expect(
      scaffoldTemplateEsmIssues([
        {
          path: 'scaffold/example.ts.template',
          source: "export { Injectable } from '@nestjs/common';",
        },
      ]),
    ).toEqual([]);
  });
});

function typeOrmPostgresState(): ScaffoldState {
  return {
    activeScaffoldSource: "database: 'postgres', orm: 'typeorm'",
    appModuleSource: 'imports: [RdbDatabaseModule]',
    composeSource: `services:
  app:
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DB_TYPE: postgres
      DB_HOST: \${DOCKER_DB_HOST:-postgres}
      DB_PORT: \${DB_PORT:-5432}
  postgres:
    image: postgres:17-alpine
volumes: {}
`,
    dependencies: new Set(['@nestjs/typeorm', 'pg', 'typeorm']),
    devDependencies: new Set(),
    envExampleSource: 'DB_TYPE=postgres',
    files: new Set([
      'src/common/persistence/typeorm-repository.adapter.ts',
      'src/config/typeorm-data-source.ts',
      'src/infra/rdb/rdb-database.module.ts',
    ]),
    loadTestEnvSource: "process.env.DB_TYPE = 'postgres';",
    persistenceE2eSource:
      "schema: database === 'postgres' ? process.env.DB_SCHEMA : undefined\ntype: database",
    rdbModuleSource: 'TypeOrmModule.forRootAsync({})',
    testComposeSource: `name: barebones-test
services:
  postgres:
    image: postgres:17-alpine
    ports:
      - \${DB_TEST_HOST_PORT:-15432}:5432
    tmpfs:
      - /var/lib/postgresql/data
`,
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
      loadTestEnvSource: current.loadTestEnvSource,
      rdbModuleSource: current.rdbModuleSource,
      testComposeSource: current.testComposeSource,
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
      loadTestEnvSource: current.loadTestEnvSource,
      rdbModuleSource: current.rdbModuleSource,
      testComposeSource: current.testComposeSource,
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
      loadTestEnvSource: current.loadTestEnvSource,
      rdbModuleSource: `${current.rdbModuleSource}\nPrismaClient`,
      testComposeSource: current.testComposeSource,
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
        'docker-compose.yml RDB does not match selection: expected mysql, found postgres',
      ]),
    );
  });

  it('ignores an image marker in a comment and rejects the actual unselected service', () => {
    const config = parseScaffoldConfig({ rdb: { database: 'postgres', orm: 'typeorm' } });
    const current = typeOrmPostgresState();
    const state: ScaffoldState = {
      activeScaffoldSource: current.activeScaffoldSource,
      appModuleSource: current.appModuleSource,
      composeSource: current.composeSource
        .replace(
          'postgres:\n    image: postgres:17-alpine',
          'mysql:\n    # image: postgres:17-alpine\n    image: mysql:8.4',
        )
        .replace('      postgres:', '      mysql:'),
      dependencies: current.dependencies,
      devDependencies: current.devDependencies,
      envExampleSource: current.envExampleSource,
      files: current.files,
      loadTestEnvSource: current.loadTestEnvSource,
      rdbModuleSource: current.rdbModuleSource,
      testComposeSource: current.testComposeSource,
    };

    expect(scaffoldConsistencyIssues(config, state)).toEqual(
      expect.arrayContaining([
        'docker-compose.yml RDB does not match selection: expected postgres, found mysql',
        'docker-compose.yml contains unselected RDB service: mysql',
      ]),
    );
  });

  it('rejects an unselected database service left beside the selected service', () => {
    const config = parseScaffoldConfig({ rdb: { database: 'postgres', orm: 'typeorm' } });
    const current = typeOrmPostgresState();
    const state: ScaffoldState = {
      activeScaffoldSource: current.activeScaffoldSource,
      appModuleSource: current.appModuleSource,
      composeSource: current.composeSource.replace(
        '\nvolumes:',
        '\n  mysql:\n    image: mysql:8.4\nvolumes:',
      ),
      dependencies: current.dependencies,
      devDependencies: current.devDependencies,
      envExampleSource: current.envExampleSource,
      files: current.files,
      loadTestEnvSource: current.loadTestEnvSource,
      rdbModuleSource: current.rdbModuleSource,
      testComposeSource: current.testComposeSource,
    };

    expect(scaffoldConsistencyIssues(config, state)).toContain(
      'docker-compose.yml contains unselected RDB service: mysql',
    );
  });

  it('rejects an unselected ORM profile file left behind', () => {
    const config = parseScaffoldConfig({ rdb: { database: 'postgres', orm: 'typeorm' } });
    const current = typeOrmPostgresState();
    const state: ScaffoldState = {
      activeScaffoldSource: current.activeScaffoldSource,
      appModuleSource: current.appModuleSource,
      composeSource: current.composeSource,
      dependencies: current.dependencies,
      devDependencies: current.devDependencies,
      envExampleSource: current.envExampleSource,
      files: new Set([...current.files, 'prisma/schema.prisma']),
      loadTestEnvSource: current.loadTestEnvSource,
      rdbModuleSource: current.rdbModuleSource,
      testComposeSource: current.testComposeSource,
    };

    expect(scaffoldConsistencyIssues(config, state)).toContain(
      'unselected ORM profile file is still present: prisma/schema.prisma',
    );
  });

  it('rejects a test compose database that differs from the selection', () => {
    const config = parseScaffoldConfig({ rdb: { database: 'mysql', orm: 'typeorm' } });
    const current = typeOrmPostgresState();

    expect(scaffoldConsistencyIssues(config, current)).toContain(
      'docker-compose.test.yml RDB does not match selection: expected mysql, found postgres',
    );
  });

  it('rejects PostgreSQL-only schema configuration passed to every TypeORM test database', () => {
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
      loadTestEnvSource: current.loadTestEnvSource,
      persistenceE2eSource: 'schema: process.env.DB_SCHEMA\ntype: database',
      rdbModuleSource: current.rdbModuleSource,
      testComposeSource: current.testComposeSource,
    };

    expect(scaffoldConsistencyIssues(config, state)).toContain(
      'TypeORM E2E must only pass DB_SCHEMA to PostgreSQL',
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
