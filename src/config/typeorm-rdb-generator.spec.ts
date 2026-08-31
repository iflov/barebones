import { readFileSync } from 'node:fs';

import { parse } from 'yaml';

import {
  materializeTypeOrmCompose,
  materializeTypeOrmEnv,
  renderActiveScaffold,
  renderTestCompose,
  selectedTypeOrmDriver,
} from './typeorm-rdb-generator.js';

const compose = `services:
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
    volumes:
      - postgres-data:/var/lib/postgresql/data

  redis:
    image: redis:7.4-alpine

volumes:
  postgres-data:
`;

describe('TypeORM RDB generator', () => {
  it.each([
    ['postgres', 'postgres:17-alpine', 'pg', '5432'],
    ['mysql', 'mysql:8.4', 'mysql2', '3306'],
    ['mariadb', 'mariadb:lts', 'mysql2', '3306'],
  ] as const)('materializes %s as one consistent selection', (database, image, driver, port) => {
    const rendered = materializeTypeOrmCompose(compose, database);

    expect(rendered).toContain(`image: ${image}`);
    expect(rendered).toContain(`DB_TYPE: ${database}`);
    expect(rendered).toContain(`DB_PORT: \${DB_PORT:-${port}}`);
    expect(selectedTypeOrmDriver(database)).toBe(driver);
    expect(
      renderActiveScaffold({
        rdb: { database, orm: 'typeorm' },
      }),
    ).toContain(`database: '${database}'`);
  });

  it('renders the selected ORM without a second renderer', () => {
    const rendered = renderActiveScaffold({
      rdb: { database: 'mysql', orm: 'prisma' },
    });

    expect(rendered).toContain("database: 'mysql'");
    expect(rendered).toContain("orm: 'prisma'");
  });

  it('updates the checked-in environment example', () => {
    const source = 'DB_TYPE=postgres\nDOCKER_DB_HOST=postgres\nDB_PORT=5432\nDB_HOST_PORT=5432\n';

    expect(materializeTypeOrmEnv(source, 'mysql')).toBe(
      'DB_TYPE=mysql\nDOCKER_DB_HOST=mysql\nDB_PORT=3306\nDB_HOST_PORT=3306\n',
    );
  });

  it('preserves container environment escaping in the MySQL healthcheck', () => {
    const rendered = materializeTypeOrmCompose(compose, 'mysql');

    expect(rendered).toContain('-u"$$MYSQL_USER" --password="$$MYSQL_PASSWORD"');
  });

  it('refuses an unknown compose shape instead of partially rewriting it', () => {
    expect(() => materializeTypeOrmCompose('services: {}', 'postgres')).toThrow(
      'must contain exactly one primary RDB service',
    );
  });

  it('preserves every existing comment while materializing the checked-in compose file', () => {
    const source = readFileSync('docker-compose.yml', 'utf8');
    const comments = source
      .split('\n')
      .filter((line) => line.includes('#'))
      .map((line) => line.trim());

    expect(comments).toHaveLength(13);
    const rendered = materializeTypeOrmCompose(source, 'mysql');
    expect(comments.filter((comment) => !rendered.includes(comment))).toEqual([]);
  });

  it('preserves a service inserted between the RDB and Redis', () => {
    const withPgAdmin = compose.replace(
      '\n  redis:',
      '\n  pgadmin:\n    image: dpage/pgadmin4:9.8\n\n  redis:',
    );

    const rendered = materializeTypeOrmCompose(withPgAdmin, 'mysql');
    expect(rendered).toContain('pgadmin:');
    expect(rendered).toContain('image: dpage/pgadmin4:9.8');
  });

  it('preserves top-level volumes when the RDB is the final service', () => {
    const rdbBlock = compose.match(/\n {2}postgres:\n[\s\S]*?(?=\n {2}redis:)/)?.[0];
    expect(rdbBlock).toBeDefined();
    const rdbLast = compose
      .replace(rdbBlock ?? '', '')
      .replace('\nvolumes:', `${rdbBlock}\nvolumes:`);

    const rendered = materializeTypeOrmCompose(rdbLast, 'mysql');
    expect(rendered).toContain('\nvolumes:\n');
    expect(rendered).toContain('mysql-data:');
  });

  it.each([
    ['postgres', 'postgres:17-alpine', 5432],
    ['mysql', 'mysql:8.4', 3306],
    ['mariadb', 'mariadb:lts', 3306],
  ] as const)('renders an isolated %s test database', (database, image, containerPort) => {
    const rendered = parse(renderTestCompose(database)) as {
      name: string;
      services: Record<string, { image: string; ports: string[]; tmpfs: string[] }>;
    };

    expect(rendered.name).toBe('barebones-test');
    expect(rendered.services[database]).toMatchObject({
      image,
      ports: [`\${DB_TEST_HOST_PORT:-15432}:${containerPort}`],
    });
    expect(rendered.services[database].tmpfs).toHaveLength(1);
    expect(renderTestCompose(database)).toContain(
      `- '\${DB_TEST_HOST_PORT:-15432}:${containerPort}'`,
    );
  });
});
