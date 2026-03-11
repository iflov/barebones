import 'reflect-metadata';

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { configureHttpApp } from './app.setup';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  configureHttpApp(app);

  const configService = app.get(ConfigService);
  const logger = app.get(Logger);
  const port = configService.get<number>('APP_PORT') ?? 3000;

  await app.listen(port);

  logger.log(`Barebones API listening on port ${port}`);
}

void bootstrap();
