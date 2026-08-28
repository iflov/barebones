import { Registry } from 'prom-client';

import { BullmqMetricsService } from './bullmq-metrics.service.js';

function createMocks() {
  const registry = new Registry();

  const metricsService = {
    getRegistry: () => registry,
    getPrefix: () => 'test_',
  };

  const queue = {
    name: 'background-jobs',
    getJobCounts: vi.fn().mockResolvedValue({ waiting: 0, active: 0 }),
  };

  const service = new (class extends BullmqMetricsService {
    constructor() {
      super(metricsService as never, queue as never);
    }
  })();

  return { service, registry, queue };
}

describe('BullmqMetricsService', () => {
  describe('constructor', () => {
    it('registers all 5 metrics in the registry', () => {
      const { registry } = createMocks();

      expect(registry.getSingleMetric('test_bullmq_jobs_processed_total')).toBeDefined();
      expect(registry.getSingleMetric('test_bullmq_jobs_failed_total')).toBeDefined();
      expect(registry.getSingleMetric('test_bullmq_job_duration_seconds')).toBeDefined();
      expect(registry.getSingleMetric('test_bullmq_queue_waiting')).toBeDefined();
      expect(registry.getSingleMetric('test_bullmq_queue_active')).toBeDefined();
    });

    it('reuses existing metrics on duplicate construction', async () => {
      const registry = new Registry();
      const metricsService = {
        getRegistry: () => registry,
        getPrefix: () => 'test_',
      };
      const queue = {
        name: 'bg',
        getJobCounts: vi.fn().mockResolvedValue({ waiting: 0, active: 0 }),
      };

      // 두 번 생성해도 에러 없음 (중복 등록 방지)
      new (class extends BullmqMetricsService {
        constructor() {
          super(metricsService as never, queue as never);
        }
      })();

      new (class extends BullmqMetricsService {
        constructor() {
          super(metricsService as never, queue as never);
        }
      })();

      const metricNames = (await registry.getMetricsAsJSON()).map((m) => m.name);
      const processedCount = metricNames.filter(
        (n) => n === 'test_bullmq_jobs_processed_total',
      ).length;

      expect(processedCount).toBe(1);
    });
  });

  describe('recordProcessed', () => {
    it('increments processed counter and observes duration', async () => {
      const { service, registry } = createMocks();

      service.recordProcessed('send-email', 0.5);

      const metrics = await registry.metrics();

      expect(metrics).toContain('test_bullmq_jobs_processed_total');
      expect(metrics).toContain('job_name="send-email"');
      expect(metrics).toContain('queue="background-jobs"');
      expect(metrics).toContain('test_bullmq_job_duration_seconds');
    });

    it('accumulates counter on multiple calls', async () => {
      const { service, registry } = createMocks();

      service.recordProcessed('send-email', 0.1);
      service.recordProcessed('send-email', 0.2);

      const metrics = await registry.getMetricsAsJSON();
      const processed = metrics.find((m) => m.name === 'test_bullmq_jobs_processed_total');

      expect(processed?.values?.[0]?.value).toBe(2);
    });
  });

  describe('recordFailed', () => {
    it('increments failed counter and observes duration', async () => {
      const { service, registry } = createMocks();

      service.recordFailed('sync-user', 1.5);

      const metrics = await registry.metrics();

      expect(metrics).toContain('test_bullmq_jobs_failed_total');
      expect(metrics).toContain('job_name="sync-user"');
      expect(metrics).toContain('test_bullmq_job_duration_seconds');
    });
  });

  describe('collect callbacks', () => {
    it('waiting gauge collects from queue on scrape', async () => {
      const { registry, queue } = createMocks();
      queue.getJobCounts.mockResolvedValue({ waiting: 7 });

      const metrics = await registry.metrics();

      expect(queue.getJobCounts).toHaveBeenCalledWith('waiting');
      expect(metrics).toContain('test_bullmq_queue_waiting');
      expect(metrics).toContain('7');
    });

    it('active gauge collects from queue on scrape', async () => {
      const { registry, queue } = createMocks();
      queue.getJobCounts.mockResolvedValue({ active: 3 });

      const metrics = await registry.metrics();

      expect(queue.getJobCounts).toHaveBeenCalledWith('active');
      expect(metrics).toContain('test_bullmq_queue_active');
      expect(metrics).toContain('3');
    });

    it('defaults to 0 when job counts are undefined', async () => {
      const { registry, queue } = createMocks();
      queue.getJobCounts.mockResolvedValue({});

      const metrics = await registry.metrics();

      expect(metrics).toContain('test_bullmq_queue_waiting');
      expect(metrics).toContain('test_bullmq_queue_active');
    });
  });
});
