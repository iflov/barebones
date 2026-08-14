import type { ScaffoldConfig } from './scaffold.config';

/** 생성기가 materialize한 현재 프로젝트 선택. barebones.config.json과 항상 같아야 한다. */
export const activeScaffold: ScaffoldConfig = {
  rdb: {
    database: 'postgres',
    orm: 'typeorm',
  },
};
