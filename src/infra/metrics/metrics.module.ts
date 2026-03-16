import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { MetricsInterceptor } from './http-metrics.interceptor';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

/**
 * Prometheus 메트릭 모듈
 *
 * @Global() — 앱 전체에서 MetricsService를 주입받을 수 있게 함.
 *   HealthModule 등 다른 모듈에서 import 없이 MetricsService를 사용 가능.
 *
 * 구성:
 *   - MetricsService: Registry(메트릭 저장소)를 생성하고 관리하는 싱글톤
 *   - MetricsInterceptor: 모든 HTTP 요청의 응답시간/상태코드를 자동 측정 (APP_INTERCEPTOR)
 */
@Global()
@Module({
  controllers: [MetricsController],
  providers: [
    MetricsService,
    MetricsInterceptor,
    {
      provide: APP_INTERCEPTOR,
      useClass: MetricsInterceptor,
    },
  ],
  exports: [MetricsService],
})
export class MetricsModule {}
