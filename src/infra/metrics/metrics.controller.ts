import { Controller, Get, Header, Version } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

import { RawResponse } from '../../common/decorators/raw-response.decorator';
import { MetricsService } from './metrics.service';

/**
 * Prometheus 스크랩 엔드포인트: GET /admin/metrics
 *
 * Prometheus가 설정된 주기(보통 15~30초)마다 이 엔드포인트에 HTTP GET 요청을 보냄.
 * 응답으로 Registry에 등록된 모든 메트릭을 텍스트 포맷으로 반환.
 *
 * 흐름:
 *   Prometheus → GET /admin/metrics
 *     → index()
 *       → metricsService.render()
 *         → registry.metrics()
 *           → collect 콜백 있는 메트릭은 이 시점에 실행 (예: 헬스체크)
 *         → 모든 메트릭을 텍스트로 직렬화하여 반환
 *
 * @ApiExcludeController — Swagger 문서에서 제외 (내부용)
 * @SkipThrottle — rate limiting 제외 (Prometheus 스크랩은 빈번하므로)
 * @RawResponse — ResponseInterceptor 우회, 텍스트 그대로 반환
 */
@ApiExcludeController()
@Controller('admin/metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @Version('1')
  @SkipThrottle()
  @RawResponse()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async index(): Promise<string> {
    return this.metricsService.render();
  }
}
