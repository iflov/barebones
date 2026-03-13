import { Controller, Get, Version } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';

import { HealthChecksService } from './health-checks.service';

/**
 * 헬스체크 엔드포인트: GET /admin/health
 *
 * k8s liveness/readiness probe 또는 로드밸런서가 호출하는 엔드포인트.
 * /admin/metrics (Prometheus용)와는 별도 경로이며, JSON 응답을 반환.
 *
 * 흐름:
 *   k8s/LB → GET /admin/health
 *     → check()
 *       → healthChecksService.getChecks() — run 함수만 추출 (key 불필요)
 *       → terminus의 health.check([fn1, fn2, ...]) — 각 함수 실행, 결과 합산
 *     → JSON 응답:
 *       {
 *         "status": "ok",
 *         "info": {
 *           "database": { "status": "up" },
 *           "memory_heap": { "status": "up" },
 *           "redis": { "status": "down" }
 *         }
 *       }
 *
 * /admin/metrics와의 차이:
 *   - /admin/health: JSON, terminus가 처리, k8s/LB용
 *   - /admin/metrics: 텍스트, prom-client가 처리, Prometheus/Grafana용
 *   - 둘 다 같은 HealthChecksService.getNamedChecks()를 소스로 사용
 */
@ApiTags('health')
@Controller('admin/health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly healthChecksService: HealthChecksService,
  ) {}

  @Get()
  @Version('1')
  @SkipThrottle()
  @HealthCheck()
  @ApiOperation({ summary: 'Application health check' })
  @ApiOkResponse({ description: 'Returns application health information' })
  check() {
    return this.health.check(this.healthChecksService.getChecks());
  }
}
