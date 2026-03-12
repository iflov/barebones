import type { IncomingMessage } from 'node:http';

import type { ConfigService } from '@nestjs/config';
import dayjs from 'dayjs';
import type { Params } from 'nestjs-pino';

function isEnabled(value: string | boolean | undefined): boolean {
  return value === true || value === 'true';
}

export function buildPinoConfig(configService: ConfigService): Params {
  const nodeEnv = configService.get<string>('NODE_ENV') ?? 'development';
  const lokiEnabled = isEnabled(configService.get<string | boolean>('LOG_LOKI_ENABLED'));
  const stdoutEnabled =
    isEnabled(configService.get<string | boolean>('LOG_STDOUT_ENABLED')) ||
    nodeEnv === 'development';
  const targets: Array<{ level?: string; options: Record<string, unknown>; target: string }> = [];

  if (stdoutEnabled) {
    targets.push({
      options: {
        colorize: true,
        ignore: 'pid,hostname',
        singleLine: true,
        translateTime: 'SYS:standard',
      },
      target: 'pino-pretty',
    });
  }

  if (lokiEnabled) {
    targets.push({
      options: {
        batching: true,
        host: configService.get<string>('LOKI_HOST') ?? 'http://localhost:3100',
        interval: 5,
        labels: {
          app: configService.get<string>('APP_NAME') ?? 'admin',
          env: nodeEnv,
        },
      },
      target: 'pino-loki',
    });
  }

  const transport =
    targets.length === 0
      ? undefined
      : targets.length === 1
        ? targets[0]
        : {
            targets,
          };

  return {
    pinoHttp: {
      autoLogging: false,
      customProps: (request: IncomingMessage & { id?: unknown; ip?: string }) => ({
        ip: request.ip,
        requestId:
          typeof request.id === 'string' || typeof request.id === 'number' ? request.id : undefined,
      }),
      level: configService.get<string>('LOG_LEVEL') ?? 'info',
      redact: {
        censor: '[Redacted]',
        paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
      },
      timestamp: () => `,"timestamp":"${dayjs().toISOString()}"`,
      transport,
    },
  };
}
