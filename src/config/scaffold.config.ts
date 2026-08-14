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
  readonly rdbModuleSource: string;
}

interface OrmProfileContract {
  readonly appModuleMarker: string;
  readonly requiredDependencies: readonly string[];
  readonly requiredDevDependencies: readonly string[];
  readonly requiredFiles: readonly string[];
}

const ORM_PROFILE_CONTRACTS: Record<OrmChoice, OrmProfileContract> = {
  drizzle: {
    appModuleMarker: 'DrizzleDatabaseModule',
    requiredDependencies: ['drizzle-orm'],
    requiredDevDependencies: ['drizzle-kit'],
    requiredFiles: ['src/infra/rdb/drizzle/drizzle-database.module.ts', 'drizzle.config.ts'],
  },
  mikroorm: {
    appModuleMarker: 'MikroOrmModule.forRoot',
    requiredDependencies: ['@mikro-orm/core', '@mikro-orm/nestjs'],
    requiredDevDependencies: [],
    requiredFiles: ['src/infra/rdb/mikroorm/mikro-orm.config.ts'],
  },
  prisma: {
    appModuleMarker: 'PrismaDatabaseModule',
    requiredDependencies: ['@prisma/client'],
    requiredDevDependencies: ['prisma'],
    requiredFiles: ['src/infra/rdb/prisma/prisma-database.module.ts', 'prisma/schema.prisma'],
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

const DATABASE_COMPOSE_MARKERS: Record<RdbChoice, string> = {
  mariadb: 'image: mariadb:',
  mysql: 'image: mysql:',
  postgres: 'image: postgres:',
};

export class ScaffoldConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScaffoldConfigError';
  }
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

  const composeMarker = DATABASE_COMPOSE_MARKERS[config.rdb.database];
  if (!state.composeSource.includes(composeMarker)) {
    issues.push(`docker-compose.yml does not provide selected database: ${config.rdb.database}`);
  }

  return issues;
}
