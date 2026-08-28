import { BackgroundJobsService } from './background-jobs.service.js';

describe('BackgroundJobsService', () => {
  function createMocks() {
    const mockQueue = {
      publish: vi.fn().mockResolvedValue(undefined),
    };

    const service = new (class extends BackgroundJobsService {
      constructor() {
        super(mockQueue as never);
      }
    })();

    return { service, mockQueue };
  }

  describe('enqueue', () => {
    it('adds a job to the queue with correct options', async () => {
      const { service, mockQueue } = createMocks();
      const payload = { to: 'user@example.com', subject: 'Hello' };

      await service.enqueue('send-email', payload);

      expect(mockQueue.publish).toHaveBeenCalledWith({ name: 'send-email', payload });
    });

    it('passes different job names and payloads correctly', async () => {
      const { service, mockQueue } = createMocks();
      const payload = { userId: '123' };

      await service.enqueue('sync-user', payload);

      expect(mockQueue.publish).toHaveBeenCalledWith({ name: 'sync-user', payload });
    });

    it('awaits the queue.add call', async () => {
      const mockQueue = {
        publish: vi.fn().mockRejectedValue(new Error('Broker down')),
      };

      const service = new (class extends BackgroundJobsService {
        constructor() {
          super(mockQueue as never);
        }
      })();

      await expect(service.enqueue('test', {})).rejects.toThrow('Broker down');
    });
  });
});
