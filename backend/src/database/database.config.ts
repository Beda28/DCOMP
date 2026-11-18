import type { DataSourceOptions } from 'typeorm';

export const databaseOptions = {
  type: 'mysql',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 3306),

  username: process.env.DB_USER ?? 'dcomp',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME ?? 'dcomp',

  charset:  'utf8mb4',
  timezone: 'Z',

  synchronize:    false,
  connectTimeout: 3000,

  extra: { connectionLimit: 5 },
} satisfies DataSourceOptions;
