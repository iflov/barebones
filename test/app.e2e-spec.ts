import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { configureHttpApp } from '../src/app.setup.js';

describe('AppController (e2e)', () => {
  let app: INestApplication | undefined;
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
    await app?.close();
  });

  /**
   * constitution E-1.
   *
   * 이 e2e 환경은 `REDIS_ENABLED=false`로 뜬다(`test/load-test-env.ts`).
   * Redis를 쓰는 기능(cache / BullMQ)이 동작하지 않는 배포이므로 헬스체크는
   * 그 사실을 그대로 보고해야 한다.
   *
   * 예전에는 redis 체크 항목을 목록에서 빼버려서 200 OK가 나갔다. k8s readiness가 통과해
   * 트래픽이 계속 들어오는데 해당 기능은 전부 실패하는 상태였다.
   */
  it('GET /v1/system/health reports 503 when a dependency is unavailable', async () => {
    const response = await request(baseUrl).get('/v1/system/health').expect(503);

    expect(response.body.code).toBe(503);
    expect(response.body.data).toBeNull();
  });

  it('GET /v1/system/metrics returns raw prometheus metrics text', async () => {
    const response = await request(baseUrl).get('/v1/system/metrics').expect(200);

    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.text).toContain('app_app_up');
    expect(response.text).toContain('app_http_request_duration_seconds_bucket');
    expect(response.text).toContain('app_http_active_requests');
    expect(response.text).toContain('app_health_check_status{indicator="database"}');
    // 게이지가 사라지지 않고 0으로 남아야 알람 룰이 발동할 대상이 생긴다 (constitution E-1).
    expect(response.text).toContain('app_health_check_status{indicator="redis"} 0');

    if (process.env.MONGODB_ENABLED === 'true') {
      expect(response.text).toContain('app_health_check_status{indicator="mongodb"} 1');
    } else {
      expect(response.text).not.toContain('app_health_check_status{indicator="mongodb"}');
    }
  });

  /**
   * CORS `exposedHeaders`에 X-Request-Id를 올려두기만 하고 아무도 설정하지 않으면
   * 값은 항상 undefined다 — 클라이언트가 받은 에러와 서버 로그를 연결할 수단이 없어진다.
   */
  it('응답에 X-Request-Id 헤더가 실린다', async () => {
    const response = await request(baseUrl).get('/v1/system/metrics').expect(200);

    expect(response.headers['x-request-id']).toBeDefined();
  });

  it('들어온 X-Request-Id를 그대로 이어받는다', async () => {
    const response = await request(baseUrl)
      .get('/v1/system/metrics')
      .set('X-Request-Id', 'upstream-trace-id')
      .expect(200);

    expect(response.headers['x-request-id']).toBe('upstream-trace-id');
  });

  it('GET /docs serves the swagger UI', async () => {
    await request(baseUrl).get('/docs').expect(200);
  });

  it('GET /docs-json serves the openapi document', async () => {
    const response = await request(baseUrl).get('/docs-json').expect(200);

    expect(response.body.openapi).toBeDefined();
    expect(response.body.paths['/v1/system/health']).toBeDefined();
  });
});
