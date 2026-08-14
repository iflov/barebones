import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import { HealthCoordinator } from '../health.coordinator';
import type { SystemHealth } from '../ports/health-indicator.port';
import { GetHealthQuery } from './get-health.query';

/** HTTP와 무관하게 health 조회 사용 사례를 실행한다. */
@QueryHandler(GetHealthQuery)
export class GetHealthQueryHandler implements IQueryHandler<GetHealthQuery, SystemHealth> {
  constructor(private readonly health: HealthCoordinator) {}

  execute(): Promise<SystemHealth> {
    return this.health.check();
  }
}
