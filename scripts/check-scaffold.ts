import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  parseScaffoldConfig,
  scaffoldConsistencyIssues,
  type ScaffoldState,
  scaffoldTemplateEsmIssues,
  typeOrmMigrationConsistencyIssues,
} from '../src/config/scaffold.config.js';

interface PackageManifest {
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

function dependencyNames(dependencies: Record<string, string> | undefined): Set<string> {
  return new Set(Object.keys(dependencies ?? {}));
}

function filesIn(path: string): string[] {
  return existsSync(path) ? readdirSync(path, { encoding: 'utf8' }) : [];
}

function templateFilesIn(path: string): string[] {
  if (!existsSync(path)) return [];

  return readdirSync(path, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = join(path, entry.name);
      return entry.isDirectory()
        ? templateFilesIn(entryPath)
        : entry.isFile() && entry.name.endsWith('.template')
          ? [entryPath]
          : [];
    })
    .sort();
}

function main(): void {
  const config = parseScaffoldConfig(readJson('barebones.config.json'));
  const packageManifest = readJson('package.json') as PackageManifest;
  const candidateFiles = [
    'drizzle.config.ts',
    'prisma.config.ts',
    'prisma/schema.prisma',
    'src/common/persistence/typeorm-repository.adapter.ts',
    'src/config/typeorm-data-source.ts',
    'src/infra/rdb/rdb-database.module.ts',
    'src/infra/rdb/mikro-orm.config.ts',
    'src/infra/rdb/schema.ts',
  ];
  const state: ScaffoldState = {
    activeScaffoldSource: readFileSync('src/config/active-scaffold.ts', 'utf8'),
    appModuleSource: readFileSync('src/app.module.ts', 'utf8'),
    composeSource: readFileSync('docker-compose.yml', 'utf8'),
    dependencies: dependencyNames(packageManifest.dependencies),
    devDependencies: dependencyNames(packageManifest.devDependencies),
    envExampleSource: readFileSync('.env.example', 'utf8'),
    files: new Set(candidateFiles.filter((path) => existsSync(path))),
    rdbModuleSource: readFileSync('src/infra/rdb/rdb-database.module.ts', 'utf8'),
  };
  const issues = scaffoldConsistencyIssues(config, state);
  issues.push(
    ...scaffoldTemplateEsmIssues(
      templateFilesIn('scaffold').map((path) => ({ path, source: readFileSync(path, 'utf8') })),
    ),
  );
  issues.push(
    ...typeOrmMigrationConsistencyIssues(config, {
      builtMigrationFiles:
        config.rdb.orm === 'typeorm' && process.argv.includes('--build-output')
          ? filesIn('dist/database/migrations')
          : undefined,
      databaseConfigSource:
        config.rdb.orm === 'typeorm' ? readFileSync('src/config/database.config.ts', 'utf8') : '',
      sourceMigrationFiles: config.rdb.orm === 'typeorm' ? filesIn('src/database/migrations') : [],
    }),
  );

  if (issues.length > 0) {
    process.stderr.write('Scaffold selection is inconsistent:\n');
    issues.forEach((issue) => process.stderr.write(`- ${issue}\n`));
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `Scaffold selection is consistent: ${config.rdb.orm} + ${config.rdb.database}\n`,
  );
}

main();
