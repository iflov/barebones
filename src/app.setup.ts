import { type INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logger.interceptor';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

export function configureHttpApp(app: INestApplication): INestApplication {
  const configService = app.get(ConfigService);

  app.use(helmet());
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  app.enableVersioning({
    prefix: 'v',
    type: VersioningType.URI,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalInterceptors(new LoggingInterceptor(app.get(Logger)));

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Barebones Admin API')
      .setDescription('NestJS migration scaffold for the legacy admin platform')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build(),
  );

  SwaggerModule.setup(
    configService.get<string>('APP_SWAGGER_PATH') ?? 'admin/docs',
    app,
    document,
    {
      swaggerOptions: {
        persistAuthorization: true,
      },
    },
  );

  return app;
}
