// Schema, migrations and catalog seed are the next file's M1 work.
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';
export function connectDatabase(connectionString: string) {
  const pool = new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  });
  return { pool, db: drizzle(pool, { schema }) };
}
export type Database = ReturnType<typeof connectDatabase>['db'];
export * from './schema';
