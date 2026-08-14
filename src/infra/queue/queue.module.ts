import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { MESSAGE_QUEUE } from '../../common/messaging/message-queue.port';
import { BACKGROUND_JOBS_QUEUE } from './background-jobs.constants';
import { BackgroundJobsProcessor } from './background-jobs.processor';
import { BackgroundJobsService } from './background-jobs.service';
import { BullmqMessageQueueAdapter } from './bullmq-message-queue.adapter';
import { BullmqMetricsService } from './bullmq-metrics.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: BACKGROUND_JOBS_QUEUE,
    }),
  ],
  providers: [
    BackgroundJobsProcessor,
    BackgroundJobsService,
    BullmqMessageQueueAdapter,
    BullmqMetricsService,
    { provide: MESSAGE_QUEUE, useExisting: BullmqMessageQueueAdapter },
  ],
  exports: [BackgroundJobsService, MESSAGE_QUEUE],
})
export class QueueModule {}
