import { BackgroundJobsService } from './background-jobs.service';

describe('BackgroundJobsService', () => {
  function createMocks() {
    const mockQueue = {
      add: jest.fn().mockResolvedValue(undefined),
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

      expect(mockQueue.add).toHaveBeenCalledWith('send-email', payload, {
        attempts: 3,
        removeOnComplete: true,
        removeOnFail: false,
      });
    });

    it('passes different job names and payloads correctly', async () => {
      const { service, mockQueue } = createMocks();
      const payload = { userId: '123' };

      await service.enqueue('sync-user', payload);

      expect(mockQueue.add).toHaveBeenCalledWith('sync-user', payload, {
        attempts: 3,
        removeOnComplete: true,
        removeOnFail: false,
      });
    });

    it('awaits the queue.add call', async () => {
      const mockQueue = {
        add: jest.fn().mockRejectedValue(new Error('Redis down')),
      };

      const service = new (class extends BackgroundJobsService {
        constructor() {
          super(mockQueue as never);
        }
      })();

      await expect(service.enqueue('test', {})).rejects.toThrow('Redis down');
    });
  });
});
