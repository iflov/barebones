import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { BACKGROUND_JOBS_QUEUE } from './background-jobs.constants';
import { BackgroundJobsProcessor } from './background-jobs.processor';
import { BackgroundJobsService } from './background-jobs.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: BACKGROUND_JOBS_QUEUE,
    }),
  ],
  providers: [BackgroundJobsProcessor, BackgroundJobsService],
  exports: [BackgroundJobsService],
})
export class QueueModule {}
