import {
  materializeTypeOrmCompose,
  materializeTypeOrmEnv,
  renderActiveScaffold,
  selectedTypeOrmDriver,
} from './typeorm-rdb-generator';

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
      'RDB service block was not found',
    );
  });
});
