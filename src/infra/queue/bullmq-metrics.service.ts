import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { Counter, Gauge, Histogram } from 'prom-client';

import { MetricsService } from '../metrics/metrics.service';
import { BACKGROUND_JOBS_QUEUE } from './background-jobs.constants';

@Injectable()
export class BullmqMetricsService {
  private readonly activeJobsGauge: Gauge<'queue'>;
  private readonly durationHistogram: Histogram<'queue' | 'job_name'>;
  private readonly failedJobsCounter: Counter<'queue' | 'job_name'>;
  private readonly processedJobsCounter: Counter<'queue' | 'job_name'>;
  private readonly waitingJobsGauge: Gauge<'queue'>;

  constructor(
    metricsService: MetricsService,
    @InjectQueue(BACKGROUND_JOBS_QUEUE)
    private readonly queue: Queue,
  ) {
    const registry = metricsService.getRegistry();
    const prefix = metricsService.getPrefix();
    const processedMetricName = `${prefix}bullmq_jobs_processed_total`;
    const failedMetricName = `${prefix}bullmq_jobs_failed_total`;
    const durationMetricName = `${prefix}bullmq_job_duration_seconds`;
    const waitingMetricName = `${prefix}bullmq_queue_waiting`;
    const activeMetricName = `${prefix}bullmq_queue_active`;

    this.processedJobsCounter =
      (registry.getSingleMetric(processedMetricName) as
        | Counter<'queue' | 'job_name'>
        | undefined) ??
      new Counter({
        help: 'Number of BullMQ jobs processed successfully',
        labelNames: ['queue', 'job_name'],
        name: processedMetricName,
        registers: [registry],
      });

    this.failedJobsCounter =
      (registry.getSingleMetric(failedMetricName) as Counter<'queue' | 'job_name'> | undefined) ??
      new Counter({
        help: 'Number of BullMQ jobs that failed',
        labelNames: ['queue', 'job_name'],
        name: failedMetricName,
        registers: [registry],
      });

    this.durationHistogram =
      (registry.getSingleMetric(durationMetricName) as
        | Histogram<'queue' | 'job_name'>
        | undefined) ??
      new Histogram({
        buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
        help: 'BullMQ job duration in seconds',
        labelNames: ['queue', 'job_name'],
        name: durationMetricName,
        registers: [registry],
      });

    this.waitingJobsGauge =
      (registry.getSingleMetric(waitingMetricName) as Gauge<'queue'> | undefined) ??
      new Gauge({
        collect: async () => {
          const counts = await this.queue.getJobCounts('waiting');

          this.waitingJobsGauge.set(
            {
              queue: this.queue.name,
            },
            counts.waiting ?? 0,
          );
        },
        help: 'Current number of BullMQ jobs waiting in the queue',
        labelNames: ['queue'],
        name: waitingMetricName,
        registers: [registry],
      });

    this.activeJobsGauge =
      (registry.getSingleMetric(activeMetricName) as Gauge<'queue'> | undefined) ??
      new Gauge({
        collect: async () => {
          const counts = await this.queue.getJobCounts('active');

          this.activeJobsGauge.set(
            {
              queue: this.queue.name,
            },
            counts.active ?? 0,
          );
        },
        help: 'Current number of BullMQ jobs actively processing',
        labelNames: ['queue'],
        name: activeMetricName,
        registers: [registry],
      });
  }

  recordProcessed(jobName: string, durationSeconds: number): void {
    this.processedJobsCounter.inc({
      job_name: jobName,
      queue: this.queue.name,
    });
    this.durationHistogram.observe(
      {
        job_name: jobName,
        queue: this.queue.name,
      },
      durationSeconds,
    );
  }

  recordFailed(jobName: string, durationSeconds: number): void {
    this.failedJobsCounter.inc({
      job_name: jobName,
      queue: this.queue.name,
    });
    this.durationHistogram.observe(
      {
        job_name: jobName,
        queue: this.queue.name,
      },
      durationSeconds,
    );
  }
}
