import 'reflect-metadata';
// 'dotenv/config'는 `.env`만 읽는다. 앱(ConfigModule)은 `.env.${NODE_ENV}`도 읽으므로
// 그대로 두면 CLI와 앱이 서로 다른 설정으로 도는 경우가 생긴다 — 같은 로더를 공유한다.
import './load-env';

import { DataSource } from 'typeorm';

import { buildDataSourceOptionsFromEnv } from './database.config';

const dataSource = new DataSource(buildDataSourceOptionsFromEnv(process.env));

export default dataSource;
