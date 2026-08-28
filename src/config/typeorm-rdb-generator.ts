import type { RdbChoice, ScaffoldConfig } from './scaffold.config.js';

interface DatabaseMaterialization {
  readonly composeService: string;
  readonly dockerHost: string;
  readonly driverPackage: 'mysql2' | 'pg';
  readonly port: number;
}

const MATERIALIZATIONS: Record<RdbChoice, DatabaseMaterialization> = {
  mariadb: {
    composeService: `  mariadb:
    image: mariadb:lts
    restart: unless-stopped
    environment:
      MARIADB_DATABASE: \${DB_DATABASE:-app}
      MARIADB_USER: \${DB_USERNAME:-app}
      MARIADB_PASSWORD: \${DB_PASSWORD:-app}
      MARIADB_ROOT_PASSWORD: \${DB_ROOT_PASSWORD:-root}
    ports:
      - '\${DB_HOST_PORT:-3306}:3306'
    volumes:
      - mariadb-data:/var/lib/mysql
    healthcheck:
      test: ['CMD', 'healthcheck.sh', '--connect', '--innodb_initialized']
      interval: 10s
      timeout: 5s
      retries: 10
`,
    dockerHost: 'mariadb',
    driverPackage: 'mysql2',
    port: 3306,
  },
  mysql: {
    composeService: `  mysql:
    image: mysql:8.4
    restart: unless-stopped
    environment:
      MYSQL_DATABASE: \${DB_DATABASE:-app}
      MYSQL_USER: \${DB_USERNAME:-app}
      MYSQL_PASSWORD: \${DB_PASSWORD:-app}
      MYSQL_ROOT_PASSWORD: \${DB_ROOT_PASSWORD:-root}
    ports:
      - '\${DB_HOST_PORT:-3306}:3306'
    volumes:
      - mysql-data:/var/lib/mysql
    healthcheck:
      test: ['CMD-SHELL', 'mysqladmin ping -h 127.0.0.1 -u"$$MYSQL_USER" --password="$$MYSQL_PASSWORD"']
      interval: 10s
      timeout: 5s
      retries: 10
`,
    dockerHost: 'mysql',
    driverPackage: 'mysql2',
    port: 3306,
  },
  postgres: {
    composeService: `  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: \${DB_DATABASE:-app}
      POSTGRES_USER: \${DB_USERNAME:-app}
      POSTGRES_PASSWORD: \${DB_PASSWORD:-app}
    ports:
      - '\${DB_HOST_PORT:-5432}:5432'
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U \${DB_USERNAME:-app} -d \${DB_DATABASE:-app}']
      interval: 10s
      timeout: 5s
      retries: 10
`,
    dockerHost: 'postgres',
    driverPackage: 'pg',
    port: 5432,
  },
};

export function materializeTypeOrmCompose(source: string, database: RdbChoice): string {
  const selected = MATERIALIZATIONS[database];
  const serviceBlock = /^ {2}(?:postgres|mysql|mariadb):\n[\s\S]*?(?=\n {2}redis:)/m;

  if (!serviceBlock.test(source)) {
    throw new Error('docker-compose.yml RDB service block was not found');
  }

  return source
    .replace(serviceBlock, () => selected.composeService.trimEnd())
    .replace(
      / {6}(?:postgres|mysql|mariadb):\n {8}condition: service_healthy/,
      `      ${selected.dockerHost}:\n        condition: service_healthy`,
    )
    .replace(/ {6}DB_TYPE: (?:postgres|mysql|mariadb)/, `      DB_TYPE: ${database}`)
    .replace(
      / {6}DB_HOST: \$\{DOCKER_DB_HOST:-(?:postgres|mysql|mariadb)\}/,
      `      DB_HOST: \${DOCKER_DB_HOST:-${selected.dockerHost}}`,
    )
    .replace(
      / {6}DB_PORT: \$\{DB_PORT:-(?:5432|3306)\}/,
      `      DB_PORT: \${DB_PORT:-${selected.port}}`,
    )
    .replace(/ {2}(?:postgres|mysql|mariadb)-data:\n/, `  ${database}-data:\n`);
}

export function materializeTypeOrmEnv(source: string, database: RdbChoice): string {
  const selected = MATERIALIZATIONS[database];

  return source
    .replace(/^DB_TYPE=.*$/m, `DB_TYPE=${database}`)
    .replace(/^DOCKER_DB_HOST=.*$/m, `DOCKER_DB_HOST=${selected.dockerHost}`)
    .replace(/^DB_PORT=.*$/m, `DB_PORT=${selected.port}`)
    .replace(/^DB_HOST_PORT=.*$/m, `DB_HOST_PORT=${selected.port}`);
}

export function renderActiveScaffold(selection: ScaffoldConfig): string {
  return `import type { ScaffoldConfig } from './scaffold.config.js';

/** 생성기가 materialize한 현재 프로젝트 선택. barebones.config.json과 항상 같아야 한다. */
export const activeScaffold: ScaffoldConfig = {
  rdb: {
    database: '${selection.rdb.database}',
    orm: '${selection.rdb.orm}',
  },
};
`;
}

export function selectedTypeOrmDriver(database: RdbChoice): 'mysql2' | 'pg' {
  return MATERIALIZATIONS[database].driverPackage;
}
