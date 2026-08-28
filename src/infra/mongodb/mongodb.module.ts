import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import { buildMongooseOptions } from '../../config/mongodb.config.js';

/** MongoDB connection adapter. Mongoose는 이 모듈과 도메인별 outbound adapter 밖으로 나가지 않는다. */
@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => buildMongooseOptions(configService),
    }),
  ],
  exports: [MongooseModule],
})
export class MongoDatabaseModule {}
