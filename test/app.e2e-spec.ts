import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureHttpApp } from '../src/app.setup';

describe('AppController (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureHttpApp(app);
    await app.init();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /v1/system/health returns the standardized envelope', async () => {
    const response = await request(baseUrl).get('/v1/system/health').expect(200);

    expect(response.body.code).toBe(200);
    expect(response.body.message).toBe('ok');
    expect(response.body.data.status).toBe('ok');
  });

  it('GET /v1/system/metrics returns raw prometheus metrics text', async () => {
    const response = await request(baseUrl).get('/v1/system/metrics').expect(200);

    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.text).toContain('app_app_up');
    expect(response.text).toContain('app_http_request_duration_seconds_bucket');
    expect(response.text).toContain('app_http_active_requests');
    expect(response.text).toContain('app_health_check_status{indicator="database"}');
  });
});
