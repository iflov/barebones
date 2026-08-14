import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

import type { MessageQueuePort, PublishMessage } from '../../common/messaging/message-queue.port';
import { BACKGROUND_JOBS_QUEUE } from './background-jobs.constants';

/** MessageQueuePort의 기본 Redis/BullMQ outbound adapter. */
@Injectable()
export class BullmqMessageQueueAdapter implements MessageQueuePort {
  constructor(@InjectQueue(BACKGROUND_JOBS_QUEUE) private readonly queue: Queue) {}

  async publish(message: PublishMessage): Promise<void> {
    await this.queue.add(message.name, message.payload, {
      attempts: message.options?.attempts ?? 3,
      deduplication: message.options?.deduplicationKey
        ? { id: message.options.deduplicationKey }
        : undefined,
      delay: message.options?.delayMs,
      removeOnComplete: true,
      removeOnFail: false,
    });
  }
}
