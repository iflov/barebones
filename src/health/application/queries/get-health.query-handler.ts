import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import { HealthCoordinator } from '../health.coordinator.js';
import type { SystemHealth } from '../ports/health-indicator.port.js';
import { GetHealthQuery } from './get-health.query.js';

/** HTTP와 무관하게 health 조회 사용 사례를 실행한다. */
@QueryHandler(GetHealthQuery)
export class GetHealthQueryHandler implements IQueryHandler<GetHealthQuery, SystemHealth> {
  constructor(private readonly health: HealthCoordinator) {}

  execute(): Promise<SystemHealth> {
    return this.health.check();
  }
}
