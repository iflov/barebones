import { existsSync, readFileSync } from 'node:fs';

import {
  parseScaffoldConfig,
  scaffoldConsistencyIssues,
  type ScaffoldState,
} from '../src/config/scaffold.config';

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

function main(): void {
  const config = parseScaffoldConfig(readJson('barebones.config.json'));
  const packageManifest = readJson('package.json') as PackageManifest;
  const candidateFiles = [
    'drizzle.config.ts',
    'prisma/schema.prisma',
    'src/common/persistence/typeorm-repository.adapter.ts',
    'src/config/typeorm-data-source.ts',
    'src/infra/rdb/rdb-database.module.ts',
    'src/infra/rdb/drizzle/drizzle-database.module.ts',
    'src/infra/rdb/mikroorm/mikro-orm.config.ts',
    'src/infra/rdb/prisma/prisma-database.module.ts',
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
