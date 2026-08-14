import { Inject, Injectable } from '@nestjs/common';

import { MESSAGE_QUEUE, type MessageQueuePort } from '../../common/messaging/message-queue.port';

@Injectable()
export class BackgroundJobsService {
  constructor(@Inject(MESSAGE_QUEUE) private readonly queue: MessageQueuePort) {}

  async enqueue(name: string, payload: Record<string, unknown>): Promise<void> {
    await this.queue.publish({ name, payload });
  }
}
