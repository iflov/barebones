import type { ConfigService } from '@nestjs/config';

import { buildMongooseOptions, buildMongoUri } from './mongodb.config';

function config(values: Record<string, unknown>): ConfigService {
  return { get: <T>(key: string) => values[key] as T } as ConfigService;
}

describe('mongodb config', () => {
  it('uses a managed MongoDB URI when one is supplied', () => {
    expect(buildMongoUri(config({ MONGODB_URI: 'mongodb+srv://cluster.example/app' }))).toBe(
      'mongodb+srv://cluster.example/app',
    );
  });

  it('builds a local default uri', () => {
    expect(buildMongoUri(config({}))).toBe(
      'mongodb://app:app@localhost:27017/app?authSource=admin',
    );
  });

  it('escapes credentials and database components', () => {
    const uri = buildMongoUri(
      config({
        MONGODB_AUTH_SOURCE: 'admin db',
        MONGODB_DATABASE: 'my db',
        MONGODB_HOST: 'mongo.internal',
        MONGODB_PASSWORD: 'p@ss:word',
        MONGODB_PORT: 27018,
        MONGODB_USERNAME: 'service/user',
      }),
    );

    expect(uri).toBe(
      'mongodb://service%2Fuser:p%40ss%3Aword@mongo.internal:27018/my%20db?authSource=admin%20db',
    );
  });

  it('uses bounded startup retries', () => {
    expect(buildMongooseOptions(config({}))).toMatchObject({
      retryAttempts: 3,
      retryDelay: 1_000,
    });
  });
});
