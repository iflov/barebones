import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { MESSAGE_QUEUE } from '../../common/messaging/message-queue.port.js';
import { buildBullConnectionOptions } from '../../config/redis.config.js';
import { BACKGROUND_JOBS_QUEUE } from './background-jobs.constants.js';
import { BackgroundJobsProcessor } from './background-jobs.processor.js';
import { BackgroundJobsService } from './background-jobs.service.js';
import { BullmqMessageQueueAdapter } from './bullmq-message-queue.adapter.js';
import { BullmqMetricsService } from './bullmq-metrics.service.js';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: buildBullConnectionOptions(configService),
        prefix: configService.get<string>('BULLMQ_PREFIX') ?? 'app',
      }),
    }),
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
