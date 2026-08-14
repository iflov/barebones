import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { RDB_HEALTH_PROBE } from '../../common/persistence/rdb-health-probe.port';
import { buildTypeOrmOptions } from '../../config/database.config';

/**
 * 선택된 RDB/ORM 조합의 단일 composition root.
 *
 * 현재 기본 프로필은 TypeORM이다. 다른 ORM을 선택하는 생성기는 AppModule을 건드리지 않고
 * 이 모듈과 ORM 전용 persistence adapter/CLI 파일만 교체한다.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => buildTypeOrmOptions(configService),
    }),
  ],
  providers: [
    {
      inject: [DataSource],
      provide: RDB_HEALTH_PROBE,
      useFactory: (dataSource: DataSource) => ({
        ping: async (): Promise<void> => {
          await dataSource.query('SELECT 1');
        },
      }),
    },
  ],
  exports: [TypeOrmModule, RDB_HEALTH_PROBE],
})
export class RdbDatabaseModule {}
