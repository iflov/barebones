import { type INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
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
  app.useGlobalFilters(new AllExceptionsFilter(app.get(Logger)));
  app.useGlobalInterceptors(new ResponseInterceptor());

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle(configService.get<string>('APP_SWAGGER_TITLE') ?? 'Barebones API')
      .setDescription(
        configService.get<string>('APP_SWAGGER_DESCRIPTION') ?? 'Reusable NestJS product scaffold',
      )
      .setVersion('1.0.0')
      .build(),
  );

  SwaggerModule.setup(configService.get<string>('APP_SWAGGER_PATH') ?? 'docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  return app;
}
