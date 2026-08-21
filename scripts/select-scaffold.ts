import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import {
  parseScaffoldConfig,
  type RdbChoice,
  type ScaffoldConfig,
} from '../src/config/scaffold.config';
import {
  materializeTypeOrmCompose,
  materializeTypeOrmEnv,
  renderActiveScaffold,
  selectedTypeOrmDriver,
} from '../src/config/typeorm-rdb-generator';

interface PackageManifest {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
}

const TYPEORM_FILES = [
  'src/common/persistence/provide-repository-port.spec.ts',
  'src/common/persistence/provide-repository-port.ts',
  'src/common/persistence/typeorm-repository.adapter.spec.ts',
  'src/common/persistence/typeorm-repository.adapter.ts',
  'src/config/database.config.spec.ts',
  'src/config/database.config.ts',
  'src/config/typeorm-data-source.ts',
  'test/persistence.e2e-spec.ts',
];

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function template(path: string): string {
  return readFileSync(`scaffold/orm-profiles/${path}`, 'utf8');
}

function replaceAll(source: string, values: Record<string, string>): string {
  let rendered = source;
  for (const [key, value] of Object.entries(values)) {
    rendered = rendered.replaceAll(key, value);
  }
  return rendered;
}

function databaseUrl(database: RdbChoice, docker = false): string {
  const scheme = database === 'postgres' ? 'postgresql' : 'mysql';
  const host = docker ? `\${DOCKER_DB_HOST:-${database}}` : 'localhost';
  const port = database === 'postgres' ? 5432 : 3306;

  if (docker) {
    return `${scheme}://\${DB_USERNAME:-app}:\${DB_PASSWORD:-app}@${host}:\${DB_PORT:-${port}}/\${DB_DATABASE:-app}`;
  }

  return `${scheme}://app:app@${host}:${port}/app`;
}

function withDatabaseUrlEnv(source: string, database: RdbChoice): string {
  const line = `DATABASE_URL=${databaseUrl(database)}`;
  if (/^DATABASE_URL=/m.test(source)) {
    return source.replace(/^DATABASE_URL=.*$/m, line);
  }
  return `${source.trimEnd()}\n${line}\n`;
}

function withDatabaseUrlCompose(source: string, database: RdbChoice): string {
  const line = `      DATABASE_URL: '${databaseUrl(database, true)}'`;
  if (/^ {6}DATABASE_URL:/m.test(source)) {
    return source.replace(/^ {6}DATABASE_URL:.*$/m, line);
  }
  return source.replace(/^ {6}DB_DATABASE:.*$/m, (match) => `${match}\n${line}`);
}

function materializeTestDatabaseEnv(source: string, database: RdbChoice): string {
  const port = database === 'postgres' ? 5432 : 3306;
  return source
    .replace(/^process\.env\.DB_TYPE = '.*';$/m, `process.env.DB_TYPE = '${database}';`)
    .replace(/^process\.env\.DB_PORT \?\?= '.*';$/m, `process.env.DB_PORT ??= '${port}';`)
    .replace(
      /^\/\/ E2E는 인메모리 DB 대신.*$/m,
      `// E2E는 인메모리 DB 대신 docker-compose의 실제 ${database}를 사용한다.`,
    )
    .replace(
      /^\/\/ compose 안에서는 이미 DB_HOST=.*$/m,
      `// compose 안에서는 DB_HOST=${database}가 주입되고, 호스트 실행은 localhost를 쓴다.`,
    );
}

function renderPrismaModule(database: RdbChoice): string {
  const source = template('prisma/rdb-database.module.ts.template');

  if (database === 'postgres') {
    return replaceAll(source, {
      __ADAPTER_CREATE__: `const adapter = new PrismaPg({
      connectionString:
        config.get<string>('DATABASE_URL') ??
        'postgresql://app:app@localhost:5432/app',
    });`,
      __ADAPTER_IMPORT__: "import { PrismaPg } from '@prisma/adapter-pg';",
    });
  }

  return replaceAll(source, {
    __ADAPTER_CREATE__: `const adapter = new PrismaMariaDb({
      connectionLimit: 5,
      database: config.get<string>('DB_DATABASE') ?? 'app',
      host: config.get<string>('DB_HOST') ?? 'localhost',
      password: config.get<string>('DB_PASSWORD') ?? 'app',
      port: config.get<number>('DB_PORT') ?? 3306,
      user: config.get<string>('DB_USERNAME') ?? 'app',
    });`,
    __ADAPTER_IMPORT__: "import { PrismaMariaDb } from '@prisma/adapter-mariadb';",
  });
}

function renderDrizzleModule(database: RdbChoice): string {
  const source = template('drizzle/rdb-database.module.ts.template');

  if (database === 'postgres') {
    return replaceAll(source, {
      __CLIENT_CREATE__: `this.client = new Pool({
      database: config.get<string>('DB_DATABASE') ?? 'app',
      host: config.get<string>('DB_HOST') ?? 'localhost',
      password: config.get<string>('DB_PASSWORD') ?? 'app',
      port: config.get<number>('DB_PORT') ?? 5432,
      user: config.get<string>('DB_USERNAME') ?? 'app',
    });`,
      __CLIENT_FIELD__: 'private readonly client: Pool;',
      __DB_TYPE__: 'NodePgDatabase',
      __DESTROY__: 'await this.client.end();',
      __DRIVER_IMPORTS__: `import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';`,
      __DRIZZLE_CREATE__: 'drizzle({ client: this.client })',
      __PING__: "await this.client.query('SELECT 1');",
    });
  }

  return replaceAll(source, {
    __CLIENT_CREATE__: `this.client = createPool({
      database: config.get<string>('DB_DATABASE') ?? 'app',
      host: config.get<string>('DB_HOST') ?? 'localhost',
      password: config.get<string>('DB_PASSWORD') ?? 'app',
      port: config.get<number>('DB_PORT') ?? 3306,
      user: config.get<string>('DB_USERNAME') ?? 'app',
    });`,
    __CLIENT_FIELD__: 'private readonly client: Pool;',
    __DB_TYPE__: 'MySql2Database',
    __DESTROY__: 'await this.client.end();',
    __DRIVER_IMPORTS__: `import type { MySql2Database } from 'drizzle-orm/mysql2';
import { drizzle } from 'drizzle-orm/mysql2';
import { createPool, type Pool } from 'mysql2/promise';`,
    __DRIZZLE_CREATE__: 'drizzle({ client: this.client })',
    __PING__: "await this.client.query('SELECT 1');",
  });
}

function profileFiles(selection: ScaffoldConfig): Record<string, string> {
  const database = selection.rdb.database;

  if (selection.rdb.orm === 'typeorm') {
    return {};
  }

  if (selection.rdb.orm === 'prisma') {
    return {
      'prisma.config.ts': template('prisma/prisma.config.ts.template').replace(
        '__DATABASE_URL__',
        databaseUrl(database),
      ),
      'prisma/schema.prisma': template('prisma/schema.prisma.template').replace(
        '__PRISMA_PROVIDER__',
        database === 'postgres' ? 'postgresql' : 'mysql',
      ),
      'src/infra/rdb/rdb-database.module.ts': renderPrismaModule(database),
    };
  }

  if (selection.rdb.orm === 'mikroorm') {
    const driverPackage =
      database === 'postgres' ? '@mikro-orm/postgresql' : `@mikro-orm/${database}`;
    return {
      'src/infra/rdb/mikro-orm.config.ts': replaceAll(
        template('mikroorm/mikro-orm.config.ts.template'),
        {
          __DB_PORT__: database === 'postgres' ? '5432' : '3306',
          __MIKRO_DRIVER_PACKAGE__: driverPackage,
        },
      ),
      'src/infra/rdb/rdb-database.module.ts': template('mikroorm/rdb-database.module.ts.template'),
    };
  }

  return {
    'drizzle.config.ts': replaceAll(template('drizzle/drizzle.config.ts.template'), {
      __DATABASE_URL__: databaseUrl(database),
      __DRIZZLE_DIALECT__: database === 'postgres' ? 'postgresql' : 'mysql',
    }),
    'src/infra/rdb/rdb-database.module.ts': renderDrizzleModule(database),
    'src/infra/rdb/schema.ts': template('drizzle/schema.ts.template'),
  };
}

function configurePackages(manifest: PackageManifest, selection: ScaffoldConfig): void {
  const removeDependencies = [
    '@mikro-orm/core',
    '@mikro-orm/mariadb',
    '@mikro-orm/migrations',
    '@mikro-orm/mysql',
    '@mikro-orm/nestjs',
    '@mikro-orm/postgresql',
    '@nestjs/typeorm',
    '@prisma/adapter-mariadb',
    '@prisma/adapter-pg',
    '@prisma/client',
    'drizzle-orm',
    'mysql2',
    'pg',
    'typeorm',
  ];
  const removeDevDependencies = ['drizzle-kit', 'prisma'];

  removeDependencies.forEach((name) => delete manifest.dependencies[name]);
  removeDevDependencies.forEach((name) => delete manifest.devDependencies[name]);
  ['typeorm', 'migration:generate', 'migration:run', 'migration:revert', 'postinstall'].forEach(
    (name) => delete manifest.scripts[name],
  );

  const database = selection.rdb.database;
  const driver = selectedTypeOrmDriver(database);
  if (selection.rdb.orm === 'typeorm') {
    manifest.dependencies['@nestjs/typeorm'] = '^11.0.0';
    manifest.dependencies.typeorm = '^0.3.24';
    manifest.dependencies[driver] = driver === 'pg' ? '^8.16.3' : '^3.15.1';
    manifest.scripts.typeorm = 'typeorm-ts-node-commonjs -d src/config/typeorm-data-source.ts';
    manifest.scripts['migration:generate'] =
      'yarn typeorm migration:generate src/database/migrations/AutoMigration';
    manifest.scripts['migration:run'] = 'yarn typeorm migration:run';
    manifest.scripts['migration:revert'] = 'yarn typeorm migration:revert';
    return;
  }

  if (selection.rdb.orm === 'prisma') {
    manifest.dependencies['@prisma/client'] = '^7.9.1';
    manifest.dependencies[
      database === 'postgres' ? '@prisma/adapter-pg' : '@prisma/adapter-mariadb'
    ] = '^7.9.1';
    manifest.devDependencies.prisma = '^7.9.1';
    manifest.scripts.postinstall = 'prisma generate';
    manifest.scripts['migration:generate'] = 'prisma migrate dev';
    manifest.scripts['migration:run'] = 'prisma migrate deploy';
    return;
  }

  if (selection.rdb.orm === 'mikroorm') {
    manifest.dependencies['@mikro-orm/core'] = '^7.1.11';
    manifest.dependencies['@mikro-orm/migrations'] = '^7.1.11';
    manifest.dependencies['@mikro-orm/nestjs'] = '^7.0.2';
    manifest.dependencies[
      database === 'postgres' ? '@mikro-orm/postgresql' : `@mikro-orm/${database}`
    ] = '^7.1.11';
    manifest.scripts['migration:generate'] = 'mikro-orm migration:create';
    manifest.scripts['migration:run'] = 'mikro-orm migration:up';
    manifest.scripts['migration:revert'] = 'mikro-orm migration:down';
    return;
  }

  manifest.dependencies['drizzle-orm'] = '^0.45.2';
  manifest.dependencies[driver] = driver === 'pg' ? '^8.16.3' : '^3.15.1';
  manifest.devDependencies['drizzle-kit'] = '^0.31.10';
  manifest.scripts['migration:generate'] = 'drizzle-kit generate';
  manifest.scripts['migration:run'] = 'drizzle-kit migrate';
}

function main(): void {
  const selection = parseScaffoldConfig({
    rdb: { database: argument('database'), orm: argument('orm') },
  });
  const apply = process.argv.includes('--apply');
  const packageManifest = JSON.parse(readFileSync('package.json', 'utf8')) as PackageManifest;

  configurePackages(packageManifest, selection);
  const files = profileFiles(selection);
  const compose = withDatabaseUrlCompose(
    materializeTypeOrmCompose(readFileSync('docker-compose.yml', 'utf8'), selection.rdb.database),
    selection.rdb.database,
  );
  const env = withDatabaseUrlEnv(
    materializeTypeOrmEnv(readFileSync('.env.example', 'utf8'), selection.rdb.database),
    selection.rdb.database,
  );
  files['.env.example'] = env;
  files['barebones.config.json'] = `${JSON.stringify(selection, null, 2)}\n`;
  files['docker-compose.yml'] = compose;
  files['package.json'] = `${JSON.stringify(packageManifest, null, 2)}\n`;
  files['test/load-test-env.ts'] = materializeTestDatabaseEnv(
    readFileSync('test/load-test-env.ts', 'utf8'),
    selection.rdb.database,
  );
  files['src/config/active-scaffold.ts'] = renderActiveScaffold(selection);

  process.stdout.write(
    `Selection plan: ${selection.rdb.orm} + ${selection.rdb.database}\n${Object.keys(files)
      .map((path) => `- write ${path}`)
      .join('\n')}\n`,
  );

  if (!apply) {
    process.stdout.write('Dry run only. Add --apply to write, install, and verify.\n');
    return;
  }

  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents, 'utf8');
  }

  if (selection.rdb.orm !== 'typeorm') {
    TYPEORM_FILES.forEach((path) => {
      if (existsSync(path)) unlinkSync(path);
    });
  }

  const install = spawnSync('yarn', ['install', '--ignore-scripts'], { stdio: 'inherit' });
  if (install.status !== 0) throw new Error('yarn install failed');

  if (selection.rdb.orm === 'prisma') {
    const result = spawnSync('yarn', ['prisma', 'generate'], { stdio: 'inherit' });
    if (result.status !== 0) throw new Error(`${selection.rdb.orm} client generation failed`);
  }

  for (const command of [
    ['yarn', 'check:scaffold'],
    ['yarn', 'lint'],
    ['yarn', 'typecheck'],
  ]) {
    const result = spawnSync(command[0], command.slice(1), { stdio: 'inherit' });
    if (result.status !== 0) throw new Error(`${command.join(' ')} failed`);
  }
}

main();
