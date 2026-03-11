import 'dotenv/config';
import 'reflect-metadata';

import { DataSource } from 'typeorm';

import { buildDataSourceOptionsFromEnv } from './database.config';

const dataSource = new DataSource(buildDataSourceOptionsFromEnv(process.env));

export default dataSource;
