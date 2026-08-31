import { parse } from 'yaml';

export const ORM_CHOICES = ['typeorm', 'prisma', 'mikroorm', 'drizzle'] as const;
export const RDB_CHOICES = ['postgres', 'mysql', 'mariadb'] as const;

export type OrmChoice = (typeof ORM_CHOICES)[number];
export type RdbChoice = (typeof RDB_CHOICES)[number];

export interface ScaffoldConfig {
  readonly rdb: {
    readonly database: RdbChoice;
    readonly orm: OrmChoice;
  };
}

export interface ScaffoldState {
  readonly activeScaffoldSource: string;
  readonly appModuleSource: string;
  readonly composeSource: string;
  readonly dependencies: ReadonlySet<string>;
  readonly devDependencies: ReadonlySet<string>;
  readonly envExampleSource: string;
  readonly files: ReadonlySet<string>;
  readonly loadTestEnvSource: string;
  readonly persistenceE2eSource?: string;
  readonly rdbModuleSource: string;
  readonly testComposeSource: string;
}

interface TypeOrmMigrationState {
  readonly builtMigrationFiles?: readonly string[];
  readonly databaseConfigSource: string;
  readonly sourceMigrationFiles: readonly string[];
}

interface ScaffoldTemplateSource {
  readonly path: string;
  readonly source: string;
}

/** ESM으로 materialize되는 template에 NodeNext 상대 지정자 확장자가 빠지는 것을 막는다. */
export function scaffoldTemplateEsmIssues(templates: readonly ScaffoldTemplateSource[]): string[] {
  const issues: string[] = [];
  const relativeSpecifierPatterns = [
    /\bfrom\s+(['"])(\.\.?\/[^'"]+)\1/g,
    /^\s*import\s+(['"])(\.\.?\/[^'"]+)\1/g,
  ];

  for (const template of templates) {
    const lines = template.source.split('\n');
    lines.forEach((line, index) => {
      for (const pattern of relativeSpecifierPatterns) {
        pattern.lastIndex = 0;
        for (const match of line.matchAll(pattern)) {
          const specifier = match[2];
          if (!/\.(?:[cm]?js|json|node)$/.test(specifier)) {
            issues.push(
              `${template.path}:${index + 1} relative ESM specifier must include an extension: ${specifier}`,
            );
          }
        }
      }
    });
  }

  return issues;
}

interface OrmProfileContract {
  readonly appModuleMarker: string;
  readonly requiredDependencies: readonly string[];
  readonly requiredDevDependencies: readonly string[];
  readonly requiredFiles: readonly string[];
}

const ORM_PROFILE_CONTRACTS: Record<OrmChoice, OrmProfileContract> = {
  drizzle: {
    appModuleMarker: "from 'drizzle-orm/",
    requiredDependencies: ['drizzle-orm'],
    requiredDevDependencies: ['drizzle-kit'],
    requiredFiles: [
      'src/infra/rdb/rdb-database.module.ts',
      'src/infra/rdb/schema.ts',
      'drizzle.config.ts',
    ],
  },
  mikroorm: {
    appModuleMarker: 'MikroOrmModule.forRoot',
    requiredDependencies: ['@mikro-orm/core', '@mikro-orm/migrations', '@mikro-orm/nestjs'],
    requiredDevDependencies: [],
    requiredFiles: ['src/infra/rdb/rdb-database.module.ts', 'src/infra/rdb/mikro-orm.config.ts'],
  },
  prisma: {
    appModuleMarker: 'PrismaClient',
    requiredDependencies: ['@prisma/client'],
    requiredDevDependencies: ['prisma'],
    requiredFiles: [
      'src/infra/rdb/rdb-database.module.ts',
      'prisma/schema.prisma',
      'prisma.config.ts',
    ],
  },
  typeorm: {
    appModuleMarker: 'TypeOrmModule.forRootAsync',
    requiredDependencies: ['@nestjs/typeorm', 'typeorm'],
    requiredDevDependencies: [],
    requiredFiles: [
      'src/common/persistence/typeorm-repository.adapter.ts',
      'src/config/typeorm-data-source.ts',
      'src/infra/rdb/rdb-database.module.ts',
    ],
  },
};

const DATABASE_DRIVER_PACKAGES: Record<OrmChoice, Record<RdbChoice, readonly string[]>> = {
  drizzle: {
    mariadb: ['mysql2'],
    mysql: ['mysql2'],
    postgres: ['pg'],
  },
  mikroorm: {
    mariadb: ['@mikro-orm/mariadb'],
    mysql: ['@mikro-orm/mysql'],
    postgres: ['@mikro-orm/postgresql'],
  },
  prisma: {
    mariadb: ['@prisma/adapter-mariadb'],
    mysql: ['@prisma/adapter-mariadb'],
    postgres: ['@prisma/adapter-pg'],
  },
  typeorm: {
    mariadb: ['mysql2'],
    mysql: ['mysql2'],
    postgres: ['pg'],
  },
};

const DATABASE_IMAGES: Record<RdbChoice, string> = {
  mariadb: 'mariadb:lts',
  mysql: 'mysql:8.4',
  postgres: 'postgres:17-alpine',
};

const DATABASE_PORTS: Record<RdbChoice, number> = {
  mariadb: 3306,
  mysql: 3306,
  postgres: 5432,
};

const DATABASE_DATA_PATHS: Record<RdbChoice, string> = {
  mariadb: '/var/lib/mysql',
  mysql: '/var/lib/mysql',
  postgres: '/var/lib/postgresql/data',
};

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function parseCompose(
  source: string,
  path: string,
): { issues: string[]; root?: Record<string, unknown> } {
  try {
    const root = record(parse(source));
    return root ? { issues: [], root } : { issues: [`${path} must contain a YAML object`] };
  } catch (error) {
    const message = error instanceof Error ? error.message.split('\n')[0] : 'unknown parse error';
    return { issues: [`${path} is invalid YAML: ${message}`] };
  }
}

function databaseServices(services: Record<string, unknown>): RdbChoice[] {
  return RDB_CHOICES.filter((database) => database in services);
}

function scalarDescription(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : 'none';
}

function baseComposeIssues(config: ScaffoldConfig, source: string): string[] {
  const parsed = parseCompose(source, 'docker-compose.yml');
  if (!parsed.root) return parsed.issues;

  const issues = [...parsed.issues];
  const services = record(parsed.root.services);
  if (!services) return [...issues, 'docker-compose.yml services map is missing'];

  const selected = config.rdb.database;
  const found = databaseServices(services);
  const selectedService = record(services[selected]);
  if (!selectedService) {
    issues.push(
      `docker-compose.yml RDB does not match selection: expected ${selected}, found ${found.join(', ') || 'none'}`,
    );
  } else if (selectedService.image !== DATABASE_IMAGES[selected]) {
    issues.push(
      `docker-compose.yml ${selected} image does not match selection: expected ${DATABASE_IMAGES[selected]}, found ${scalarDescription(selectedService.image)}`,
    );
  }
  found
    .filter((database) => database !== selected)
    .forEach((database) =>
      issues.push(`docker-compose.yml contains unselected RDB service: ${database}`),
    );

  const app = record(services.app);
  const dependsOn = record(app?.depends_on);
  if (!dependsOn || !(selected in dependsOn)) {
    issues.push(`docker-compose.yml app.depends_on does not include selected RDB: ${selected}`);
  }
  const environment = record(app?.environment);
  const expectedEnvironment = {
    DB_HOST: `\${DOCKER_DB_HOST:-${selected}}`,
    DB_PORT: `\${DB_PORT:-${DATABASE_PORTS[selected]}}`,
    DB_TYPE: selected,
  };
  for (const [name, expected] of Object.entries(expectedEnvironment)) {
    if (environment?.[name] !== expected) {
      issues.push(`docker-compose.yml app ${name} does not match selection: expected ${expected}`);
    }
  }
  return issues;
}

function testComposeIssues(config: ScaffoldConfig, source: string): string[] {
  const parsed = parseCompose(source, 'docker-compose.test.yml');
  if (!parsed.root) return parsed.issues;

  const issues = [...parsed.issues];
  if (parsed.root.name !== 'barebones-test') {
    issues.push('docker-compose.test.yml must use project name: barebones-test');
  }
  const services = record(parsed.root.services);
  if (!services) return [...issues, 'docker-compose.test.yml services map is missing'];

  const selected = config.rdb.database;
  const found = databaseServices(services);
  const selectedService = record(services[selected]);
  if (!selectedService) {
    issues.push(
      `docker-compose.test.yml RDB does not match selection: expected ${selected}, found ${found.join(', ') || 'none'}`,
    );
  } else if (selectedService.image !== DATABASE_IMAGES[selected]) {
    issues.push(
      `docker-compose.test.yml ${selected} image does not match selection: expected ${DATABASE_IMAGES[selected]}, found ${scalarDescription(selectedService.image)}`,
    );
  }
  found
    .filter((database) => database !== selected)
    .forEach((database) =>
      issues.push(`docker-compose.test.yml contains unselected RDB service: ${database}`),
    );
  const ports = selectedService?.ports;
  const expectedPort = `\${DB_TEST_HOST_PORT:-15432}:${DATABASE_PORTS[selected]}`;
  if (!Array.isArray(ports) || !ports.includes(expectedPort)) {
    issues.push(`docker-compose.test.yml port does not match selection: expected ${expectedPort}`);
  }
  const tmpfs = selectedService?.tmpfs;
  if (!Array.isArray(tmpfs) || !tmpfs.includes(DATABASE_DATA_PATHS[selected])) {
    issues.push(
      `docker-compose.test.yml must use tmpfs for selected RDB data: ${DATABASE_DATA_PATHS[selected]}`,
    );
  }
  if (selectedService && 'volumes' in selectedService) {
    issues.push('docker-compose.test.yml selected RDB must not use a persistent volume');
  }
  return issues;
}

export class ScaffoldConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScaffoldConfigError';
  }
}

function migrationNames(files: readonly string[], extension: '.js' | '.ts'): string[] {
  return files
    .filter((file) => file.endsWith(extension))
    .map((file) => file.slice(0, -extension.length))
    .sort();
}

/** TypeORM migration discovery가 CWD에 묶이거나 빌드 중 조용히 누락되는 것을 막는다. */
export function typeOrmMigrationConsistencyIssues(
  config: ScaffoldConfig,
  state: TypeOrmMigrationState,
): string[] {
  if (config.rdb.orm !== 'typeorm') {
    return [];
  }

  const issues: string[] = [];
  if (
    !state.databaseConfigSource.includes('fileURLToPath(import.meta.url)') ||
    !state.databaseConfigSource.includes('../database/migrations/*{.ts,.js}')
  ) {
    issues.push('TypeORM migrations must use a self-locating import.meta.url glob');
  }

  if (state.builtMigrationFiles === undefined) {
    return issues;
  }

  const sourceNames = migrationNames(state.sourceMigrationFiles, '.ts');
  const builtNames = migrationNames(state.builtMigrationFiles, '.js');
  if (sourceNames.join('\0') !== builtNames.join('\0')) {
    issues.push(
      `compiled TypeORM migrations do not match source: source=[${sourceNames.join(', ')}] built=[${builtNames.join(', ')}]`,
    );
  }

  return issues;
}

export function parseScaffoldConfig(input: unknown): ScaffoldConfig {
  if (typeof input !== 'object' || input === null) {
    throw new ScaffoldConfigError('barebones.config.json must contain an object');
  }

  const rdb = (input as { rdb?: unknown }).rdb;
  if (typeof rdb !== 'object' || rdb === null) {
    throw new ScaffoldConfigError('rdb must contain an object');
  }

  const database = (rdb as { database?: unknown }).database;
  const orm = (rdb as { orm?: unknown }).orm;

  if (typeof database !== 'string' || !RDB_CHOICES.includes(database as RdbChoice)) {
    throw new ScaffoldConfigError(`rdb.database must be one of: ${RDB_CHOICES.join(', ')}`);
  }

  if (typeof orm !== 'string' || !ORM_CHOICES.includes(orm as OrmChoice)) {
    throw new ScaffoldConfigError(`rdb.orm must be one of: ${ORM_CHOICES.join(', ')}`);
  }

  return {
    rdb: {
      database: database as RdbChoice,
      orm: orm as OrmChoice,
    },
  };
}

/** 선택 파일과 실제 의존성/부팅 경로가 섞였는지 검사한다. */
export function scaffoldConsistencyIssues(config: ScaffoldConfig, state: ScaffoldState): string[] {
  const issues: string[] = [];
  const contract = ORM_PROFILE_CONTRACTS[config.rdb.orm];

  if (!state.activeScaffoldSource.includes(`database: '${config.rdb.database}'`)) {
    issues.push(`active-scaffold.ts database does not match selection: ${config.rdb.database}`);
  }

  if (!state.activeScaffoldSource.includes(`orm: '${config.rdb.orm}'`)) {
    issues.push(`active-scaffold.ts ORM does not match selection: ${config.rdb.orm}`);
  }

  if (!state.appModuleSource.includes('RdbDatabaseModule')) {
    issues.push('AppModule does not import the RDB composition root: RdbDatabaseModule');
  }

  for (const dependency of contract.requiredDependencies) {
    if (!state.dependencies.has(dependency)) {
      issues.push(`missing dependency for ${config.rdb.orm}: ${dependency}`);
    }
  }

  for (const dependency of contract.requiredDevDependencies) {
    if (!state.devDependencies.has(dependency)) {
      issues.push(`missing devDependency for ${config.rdb.orm}: ${dependency}`);
    }
  }

  for (const dependency of DATABASE_DRIVER_PACKAGES[config.rdb.orm][config.rdb.database]) {
    if (!state.dependencies.has(dependency)) {
      issues.push(
        `missing database driver for ${config.rdb.orm}/${config.rdb.database}: ${dependency}`,
      );
    }
  }

  const selectedDriverPackages = new Set(
    DATABASE_DRIVER_PACKAGES[config.rdb.orm][config.rdb.database],
  );
  for (const database of RDB_CHOICES) {
    if (database === config.rdb.database) {
      continue;
    }

    for (const dependency of DATABASE_DRIVER_PACKAGES[config.rdb.orm][database]) {
      if (!selectedDriverPackages.has(dependency) && state.dependencies.has(dependency)) {
        issues.push(`unselected database driver is still installed: ${dependency}`);
      }
    }
  }

  for (const orm of ORM_CHOICES) {
    if (orm === config.rdb.orm) {
      continue;
    }

    const unselectedContract = ORM_PROFILE_CONTRACTS[orm];
    for (const dependency of unselectedContract.requiredDependencies) {
      if (state.dependencies.has(dependency)) {
        issues.push(`unselected ORM dependency is still installed: ${dependency}`);
      }
    }

    for (const dependency of unselectedContract.requiredDevDependencies) {
      if (state.devDependencies.has(dependency)) {
        issues.push(`unselected ORM devDependency is still installed: ${dependency}`);
      }
    }
  }

  for (const file of contract.requiredFiles) {
    if (!state.files.has(file)) {
      issues.push(`missing profile file for ${config.rdb.orm}: ${file}`);
    }
  }

  const selectedFiles = new Set(contract.requiredFiles);
  for (const orm of ORM_CHOICES) {
    if (orm === config.rdb.orm) continue;
    for (const file of ORM_PROFILE_CONTRACTS[orm].requiredFiles) {
      if (!selectedFiles.has(file) && state.files.has(file)) {
        issues.push(`unselected ORM profile file is still present: ${file}`);
      }
    }
  }

  for (const orm of ORM_CHOICES) {
    const marker = ORM_PROFILE_CONTRACTS[orm].appModuleMarker;
    const markerIsPresent = state.rdbModuleSource.includes(marker);

    if (orm === config.rdb.orm && !markerIsPresent) {
      issues.push(`RdbDatabaseModule does not activate selected ORM: ${config.rdb.orm}`);
    }

    if (orm !== config.rdb.orm && markerIsPresent) {
      issues.push(`RdbDatabaseModule also activates unselected ORM: ${orm}`);
    }
  }

  if (!state.envExampleSource.includes(`DB_TYPE=${config.rdb.database}`)) {
    issues.push(`.env.example DB_TYPE does not match selected database: ${config.rdb.database}`);
  }

  if (!state.loadTestEnvSource.includes(`process.env.DB_TYPE = '${config.rdb.database}'`)) {
    issues.push(
      `test/load-test-env.ts DB_TYPE does not match selection: expected ${config.rdb.database}`,
    );
  }

  if (config.rdb.orm === 'typeorm') {
    if (
      !state.persistenceE2eSource?.includes(
        "schema: database === 'postgres' ? process.env.DB_SCHEMA : undefined",
      )
    ) {
      issues.push('TypeORM E2E must only pass DB_SCHEMA to PostgreSQL');
    }
    if (!state.persistenceE2eSource?.includes('type: database')) {
      issues.push('TypeORM E2E must use the validated test database type');
    }
  }

  issues.push(...baseComposeIssues(config, state.composeSource));
  issues.push(...testComposeIssues(config, state.testComposeSource));

  return issues;
}
