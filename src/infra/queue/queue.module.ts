import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { BACKGROUND_JOBS_QUEUE } from './background-jobs.constants';
import { BackgroundJobsProcessor } from './background-jobs.processor';
import { BackgroundJobsService } from './background-jobs.service';
import { BullmqMetricsService } from './bullmq-metrics.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: BACKGROUND_JOBS_QUEUE,
    }),
  ],
  providers: [BackgroundJobsProcessor, BackgroundJobsService, BullmqMetricsService],
  exports: [BackgroundJobsService],
})
export class QueueModule {}
