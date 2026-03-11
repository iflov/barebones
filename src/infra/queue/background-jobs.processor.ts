import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Job } from 'bullmq';
import { Logger } from 'nestjs-pino';

import { BACKGROUND_JOBS_QUEUE } from './background-jobs.constants';

@Injectable()
@Processor(BACKGROUND_JOBS_QUEUE)
export class BackgroundJobsProcessor extends WorkerHost {
  constructor(private readonly logger: Logger) {
    super();
  }

  process(job: Job<Record<string, unknown>>): Promise<Record<string, unknown>> {
    this.logger.debug(
      { jobId: job.id, jobName: job.name, payload: job.data },
      'Processed BullMQ background job',
    );

    return Promise.resolve(job.data);
  }
}
