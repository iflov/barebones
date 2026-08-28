import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Job } from 'bullmq';
import { Logger } from 'nestjs-pino';

import { BACKGROUND_JOBS_QUEUE } from './background-jobs.constants.js';
import { BullmqMetricsService } from './bullmq-metrics.service.js';

@Injectable()
@Processor(BACKGROUND_JOBS_QUEUE)
export class BackgroundJobsProcessor extends WorkerHost {
  constructor(
    private readonly logger: Logger,
    private readonly bullmqMetricsService: BullmqMetricsService,
  ) {
    super();
  }

  async process(job: Job<Record<string, unknown>>): Promise<Record<string, unknown>> {
    const startedAt = process.hrtime.bigint();

    try {
      this.logger.debug(
        { jobId: job.id, jobName: job.name, payload: job.data },
        'Processed BullMQ background job',
      );

      const result = await Promise.resolve(job.data);
      const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;

      this.bullmqMetricsService.recordProcessed(job.name, durationSeconds);

      return result;
    } catch (error) {
      const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;

      this.bullmqMetricsService.recordFailed(job.name, durationSeconds);
      throw error;
    }
  }
}
