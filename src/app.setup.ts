import { type INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { buildCorsOptions } from './config/cors.config';

function isTruthy(value: string | boolean | undefined): boolean {
  return value === true || value === 'true';
}

/**
 * 전역 요청 파이프라인을 구성한다.
 *
 * 순서 = 요청이 거치는 순서다:
 * `helmet → CORS → ThrottlerGuard(app.module) → LoggingInterceptor → ValidationPipe
 *  → Controller → ResponseInterceptor`
 */
export function configureHttpApp(app: INestApplication): INestApplication {
  const configService = app.get(ConfigService);

  app.use(helmet());
  app.useLogger(app.get(Logger));
  configureTrustProxy(app, configService);

  // 시그널 리스너는 main.ts의 registerGracefulShutdown이 단독으로 관리한다.
  // 여기서 enableShutdownHooks()를 부르면 Nest 기본 리스너와 이중으로 close()가 호출된다.

  if (isTruthy(configService.get<string | boolean>('CORS_ENABLED'))) {
    app.enableCors(buildCorsOptions(configService));
  }

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

  if (isTruthy(configService.get<string | boolean>('APP_SWAGGER_ENABLED'))) {
    configureSwagger(app, configService);
  }

  return app;
}

/**
 * 프록시 홉 수를 설정한다.
 *
 * Express의 `req.ip`는 기본적으로 **TCP 소켓의 상대 주소**다. 로드밸런서 뒤에서는 항상
 * 프록시 IP이므로, IP 기준으로 도는 것들이 전부 같은 값을 본다:
 *
 * - `ThrottlerGuard`가 **모든 사용자를 한 버킷에** 넣는다 → `THROTTLE_LIMIT`이 전체 합산이 되어
 *   한 명이 시끄러우면 전원 429
 * - 로그·감사 기록의 IP가 전부 프록시 주소
 *
 * 진짜 클라이언트 IP는 `X-Forwarded-For`에 있지만 **헤더는 위조 가능하므로** Express는
 * 기본적으로 믿지 않는다. 몇 번째 홉까지 신뢰할지는 **배포 토폴로지가 결정**한다 —
 * ALB 하나면 1, CloudFront까지 얹으면 2. 그래서 코드가 아니라 환경변수로 둔다.
 *
 * ⚠ **`true`(전부 신뢰)는 쓰지 않는다.** 클라이언트가 XFF를 위조해 매 요청 다른 IP를 주장하면
 * throttle을 무한 우회할 수 있다. 그래서 이 값은 숫자만 받는다.
 */
export function configureTrustProxy(app: INestApplication, configService: ConfigService): void {
  const hops = Number(configService.get<number | string>('TRUST_PROXY_HOPS') ?? 0);

  // 정수가 아닌 값은 무시한다. `env.validation.ts`가 이미 부팅 시점에 거부하지만,
  // 여기서 한 번 더 막지 않으면 `'true'` 같은 값이 Express에 그대로 전달되어
  // **모든 XFF를 신뢰**하는 상태가 만들어질 수 있다 — 그게 정확히 막아야 하는 것이다.
  if (!Number.isInteger(hops) || hops <= 0) {
    return;
  }

  // NestExpressApplication으로 좁히지 않고 어댑터를 통해 설정한다 —
  // configureHttpApp의 시그니처를 플랫폼에 묶지 않기 위함이다.
  // 필요한 것만 담은 타입으로 좁혀 `any` 전파를 막는다.
  const httpServer = app.getHttpAdapter().getInstance() as SettableHttpServer;

  httpServer.set('trust proxy', hops);
}

/** `trust proxy` 설정에 필요한 최소 표면 (Express의 `app.set`). */
interface SettableHttpServer {
  set(setting: string, value: unknown): void;
}

/**
 * Swagger 문서.
 *
 * `APP_SWAGGER_ENABLED=false`로 끌 수 있다. 스펙이 공개돼도 되는지는 배포 환경마다 다르고,
 * 끄는 수단이 없으면 "코드를 고쳐서 배포"가 유일한 방법이 된다.
 */
function configureSwagger(app: INestApplication, configService: ConfigService): void {
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
}
