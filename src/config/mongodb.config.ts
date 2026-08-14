import type { ConfigService } from '@nestjs/config';
import type { MongooseModuleOptions } from '@nestjs/mongoose';

export function buildMongoUri(configService: ConfigService): string {
  const host = configService.get<string>('MONGODB_HOST') ?? 'localhost';
  const port = configService.get<number>('MONGODB_PORT') ?? 27017;
  const username = encodeURIComponent(configService.get<string>('MONGODB_USERNAME') ?? 'app');
  const password = encodeURIComponent(configService.get<string>('MONGODB_PASSWORD') ?? 'app');
  const database = encodeURIComponent(configService.get<string>('MONGODB_DATABASE') ?? 'app');
  const authSource = encodeURIComponent(
    configService.get<string>('MONGODB_AUTH_SOURCE') ?? 'admin',
  );

  return `mongodb://${username}:${password}@${host}:${port}/${database}?authSource=${authSource}`;
}

export function buildMongooseOptions(configService: ConfigService): MongooseModuleOptions {
  return {
    retryAttempts: 3,
    retryDelay: 1_000,
    uri: buildMongoUri(configService),
  };
}
