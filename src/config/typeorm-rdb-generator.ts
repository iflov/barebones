import type { Document, YAMLMap } from 'yaml';
import { isMap, parseDocument, Scalar } from 'yaml';

import type { RdbChoice, ScaffoldConfig } from './scaffold.config.js';

interface DatabaseMaterialization {
  readonly composeService: Record<string, unknown>;
  readonly dockerHost: string;
  readonly driverPackage: 'mysql2' | 'pg';
  readonly port: number;
}

const MATERIALIZATIONS: Record<RdbChoice, DatabaseMaterialization> = {
  mariadb: {
    composeService: {
      image: 'mariadb:lts',
      restart: 'unless-stopped',
      environment: {
        MARIADB_DATABASE: '${DB_DATABASE:-app}',
        MARIADB_USER: '${DB_USERNAME:-app}',
        MARIADB_PASSWORD: '${DB_PASSWORD:-app}',
        MARIADB_ROOT_PASSWORD: '${DB_ROOT_PASSWORD:-root}',
      },
      ports: ['${DB_HOST_PORT:-3306}:3306'],
      volumes: ['mariadb-data:/var/lib/mysql'],
      healthcheck: {
        test: ['CMD', 'healthcheck.sh', '--connect', '--innodb_initialized'],
        interval: '10s',
        timeout: '5s',
        retries: 10,
      },
    },
    dockerHost: 'mariadb',
    driverPackage: 'mysql2',
    port: 3306,
  },
  mysql: {
    composeService: {
      image: 'mysql:8.4',
      restart: 'unless-stopped',
      environment: {
        MYSQL_DATABASE: '${DB_DATABASE:-app}',
        MYSQL_USER: '${DB_USERNAME:-app}',
        MYSQL_PASSWORD: '${DB_PASSWORD:-app}',
        MYSQL_ROOT_PASSWORD: '${DB_ROOT_PASSWORD:-root}',
      },
      ports: ['${DB_HOST_PORT:-3306}:3306'],
      volumes: ['mysql-data:/var/lib/mysql'],
      healthcheck: {
        test: [
          'CMD-SHELL',
          'mysqladmin ping -h 127.0.0.1 -u"$$MYSQL_USER" --password="$$MYSQL_PASSWORD"',
        ],
        interval: '10s',
        timeout: '5s',
        retries: 10,
      },
    },
    dockerHost: 'mysql',
    driverPackage: 'mysql2',
    port: 3306,
  },
  postgres: {
    composeService: {
      image: 'postgres:17-alpine',
      restart: 'unless-stopped',
      environment: {
        POSTGRES_DB: '${DB_DATABASE:-app}',
        POSTGRES_USER: '${DB_USERNAME:-app}',
        POSTGRES_PASSWORD: '${DB_PASSWORD:-app}',
      },
      ports: ['${DB_HOST_PORT:-5432}:5432'],
      volumes: ['postgres-data:/var/lib/postgresql/data'],
      healthcheck: {
        test: ['CMD-SHELL', 'pg_isready -U ${DB_USERNAME:-app} -d ${DB_DATABASE:-app}'],
        interval: '10s',
        timeout: '5s',
        retries: 10,
      },
    },
    dockerHost: 'postgres',
    driverPackage: 'pg',
    port: 5432,
  },
};

const RDB_SERVICES = new Set<RdbChoice>(['postgres', 'mysql', 'mariadb']);

function requiredMap(value: unknown, name: string): YAMLMap {
  if (!isMap(value)) throw new Error(`docker-compose.yml ${name} map was not found`);
  return value;
}

function replaceMapEntry(
  document: Document,
  map: YAMLMap,
  currentKey: string,
  nextKey: string,
  value: unknown,
): void {
  const pair = map.items.find((item) => String(item.key) === currentKey);
  if (!pair) throw new Error(`docker-compose.yml ${currentKey} entry was not found`);
  pair.key = document.createNode(nextKey);
  pair.value = document.createNode(value);
}

function renameMapEntry(
  document: Document,
  map: YAMLMap,
  currentKey: string,
  nextKey: string,
): void {
  const pair = map.items.find((item) => String(item.key) === currentKey);
  if (!pair) throw new Error(`docker-compose.yml ${currentKey} entry was not found`);
  pair.key = document.createNode(nextKey);
}

export function materializeTypeOrmCompose(source: string, database: RdbChoice): string {
  const selected = MATERIALIZATIONS[database];
  const document = parseDocument(source);
  if (document.errors.length > 0) throw new Error(`docker-compose.yml is invalid YAML`);

  const services = requiredMap(document.get('services', true), 'services');
  const currentDatabases = services.items
    .map((item) => String(item.key))
    .filter((key): key is RdbChoice => RDB_SERVICES.has(key as RdbChoice));
  if (currentDatabases.length !== 1) {
    throw new Error('docker-compose.yml must contain exactly one primary RDB service');
  }

  replaceMapEntry(document, services, currentDatabases[0], database, selected.composeService);

  const dependsOn = requiredMap(
    document.getIn(['services', 'app', 'depends_on'], true),
    'depends_on',
  );
  replaceMapEntry(document, dependsOn, currentDatabases[0], database, {
    condition: 'service_healthy',
  });
  document.setIn(['services', 'app', 'environment', 'DB_TYPE'], database);
  document.setIn(
    ['services', 'app', 'environment', 'DB_HOST'],
    `\${DOCKER_DB_HOST:-${selected.dockerHost}}`,
  );
  document.setIn(['services', 'app', 'environment', 'DB_PORT'], `\${DB_PORT:-${selected.port}}`);

  const volumes = requiredMap(document.get('volumes', true), 'volumes');
  renameMapEntry(document, volumes, `${currentDatabases[0]}-data`, `${database}-data`);
  return document.toString({ lineWidth: 0 });
}

export function renderTestCompose(database: RdbChoice): string {
  const selected = MATERIALIZATIONS[database];
  const document = parseDocument('name: barebones-test\nservices:\n  placeholder: {}\n');
  const service = structuredClone(selected.composeService);
  delete service.restart;
  delete service.volumes;
  service.ports = [`\${DB_TEST_HOST_PORT:-15432}:${selected.port}`];
  service.tmpfs = [database === 'postgres' ? '/var/lib/postgresql/data' : '/var/lib/mysql'];
  document.setIn(['services', database], document.createNode(service));
  document.deleteIn(['services', 'placeholder']);
  const publishedPort = new Scalar(`\${DB_TEST_HOST_PORT:-15432}:${selected.port}`);
  publishedPort.type = Scalar.QUOTE_SINGLE;
  document.setIn(['services', database, 'ports', 0], publishedPort);
  return document.toString({ lineWidth: 0 });
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
