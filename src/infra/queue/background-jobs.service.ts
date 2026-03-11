import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { BACKGROUND_JOBS_QUEUE } from './background-jobs.constants';

@Injectable()
export class BackgroundJobsService {
  constructor(
    @InjectQueue(BACKGROUND_JOBS_QUEUE)
    private readonly queue: Queue,
  ) {}

  async enqueue(name: string, payload: Record<string, unknown>): Promise<void> {
    await this.queue.add(name, payload, {
      attempts: 3,
      removeOnComplete: true,
      removeOnFail: false,
    });
  }
}
