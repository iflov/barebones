import type { ConfigService } from '@nestjs/config';

jest.mock('uuid', () => ({
  v4: () => 'test-correlation-id',
}));

import { buildPinoConfig } from './pino.config';

function createConfigService(values: Record<string, unknown>): ConfigService {
  return {
    get: <T>(key: string) => values[key] as T,
  } as ConfigService;
}

describe('buildPinoConfig', () => {
  it('uses app/env labels for the Loki transport', () => {
    const config = createConfigService({
      APP_NAME: 'admin',
      LOG_LEVEL: 'debug',
      LOG_LOKI_ENABLED: true,
      LOG_STDOUT_ENABLED: false,
      LOKI_HOST: 'http://loki:3100',
      NODE_ENV: 'production',
    });

    const options = buildPinoConfig(config);
    const pinoHttp = options.pinoHttp as {
      transport?: {
        options: { host: string; labels: { app: string; env: string } };
        target: string;
      };
    };
    const transport = pinoHttp.transport as {
      options: { host: string; labels: { app: string; env: string } };
      target: string;
    };

    expect(transport.target).toBe('pino-loki');
    expect(transport.options.host).toBe('http://loki:3100');
    expect(transport.options.labels).toEqual({
      app: 'admin',
      env: 'production',
    });
  });

  it('omits the Loki transport when disabled', () => {
    const config = createConfigService({
      LOG_LEVEL: 'info',
      LOG_LOKI_ENABLED: false,
      LOG_STDOUT_ENABLED: false,
      NODE_ENV: 'production',
    });

    const options = buildPinoConfig(config);
    const pinoHttp = options.pinoHttp as {
      transport?: unknown;
    };

    expect(pinoHttp.transport).toBeUndefined();
  });
});
