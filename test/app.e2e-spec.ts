import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureHttpApp } from '../src/app.setup';

describe('HealthController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureHttpApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /admin/v1/health returns the standardized envelope', async () => {
    const response = await request(app.getHttpAdapter().getInstance())
      .get('/v1/admin/health')
      .expect(200);

    expect(response.body.code).toBe(200);
    expect(response.body.message).toBe('ok');
    expect(response.body.data.status).toBe('ok');
  });

  it('GET /v1/admin/users returns the standardized envelope', async () => {
    const response = await request(app.getHttpAdapter().getInstance())
      .get('/v1/admin/users')
      .expect(200);

    expect(response.body.code).toBe(200);
    expect(response.body.message).toBe('ok');
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data[0]?.email).toBe('admin@h2biz.co.kr');
  });

  it('GET /v1/admin/metrics returns raw prometheus metrics text', async () => {
    const response = await request(app.getHttpAdapter().getInstance())
      .get('/v1/admin/metrics')
      .expect(200);

    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.text).toContain('admin_test_app_up');
    expect(response.text).toContain('admin_test_http_request_duration_seconds_bucket');
    expect(response.text).toContain('admin_test_http_active_requests');
    expect(response.text).toContain('admin_test_health_check_status{indicator="database"}');
  });
});
