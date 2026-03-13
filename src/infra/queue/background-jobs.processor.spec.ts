import { BackgroundJobsProcessor } from './background-jobs.processor';

function createMocks() {
  const logger = {
    debug: jest.fn(),
  };

  const bullmqMetricsService = {
    recordProcessed: jest.fn(),
    recordFailed: jest.fn(),
  };

  const processor = new (class extends BackgroundJobsProcessor {
    constructor() {
      super(logger as never, bullmqMetricsService as never);
    }
  })();

  return { processor, logger, bullmqMetricsService };
}

function createJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    name: 'send-email',
    data: { to: 'user@example.com' },
    ...overrides,
  } as never;
}

describe('BackgroundJobsProcessor', () => {
  describe('process', () => {
    it('returns job data on success', async () => {
      const { processor } = createMocks();
      const job = createJob();

      const result = await processor.process(job);

      expect(result).toEqual({ to: 'user@example.com' });
    });

    it('logs job details on success', async () => {
      const { processor, logger } = createMocks();
      const job = createJob();

      await processor.process(job);

      expect(logger.debug).toHaveBeenCalledWith(
        { jobId: 'job-1', jobName: 'send-email', payload: { to: 'user@example.com' } },
        'Processed BullMQ background job',
      );
    });

    it('records processed metric on success', async () => {
      const { processor, bullmqMetricsService } = createMocks();
      const job = createJob();

      await processor.process(job);

      expect(bullmqMetricsService.recordProcessed).toHaveBeenCalledWith(
        'send-email',
        expect.any(Number),
      );
    });

    it('records duration as a positive number', async () => {
      const { processor, bullmqMetricsService } = createMocks();
      const job = createJob();

      await processor.process(job);

      const duration = bullmqMetricsService.recordProcessed.mock.calls[0][1];

      expect(duration).toBeGreaterThanOrEqual(0);
      expect(duration).toBeLessThan(1);
    });

    it('records failed metric and rethrows on error', async () => {
      const logger = {
        debug: jest.fn().mockImplementation(() => {
          throw new Error('boom');
        }),
      };
      const bullmqMetricsService = { recordProcessed: jest.fn(), recordFailed: jest.fn() };

      const processor = new (class extends BackgroundJobsProcessor {
        constructor() {
          super(logger as never, bullmqMetricsService as never);
        }
      })();

      const job = createJob();

      await expect(processor.process(job)).rejects.toThrow('boom');
      expect(bullmqMetricsService.recordFailed).toHaveBeenCalledWith(
        'send-email',
        expect.any(Number),
      );
      expect(bullmqMetricsService.recordProcessed).not.toHaveBeenCalled();
    });
  });
});
