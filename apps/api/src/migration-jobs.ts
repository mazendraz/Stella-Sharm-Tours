import { PgBoss } from 'pg-boss';
import { bootstrapQueues } from './jobs';
export async function migrateQueues(url: string) {
  const boss = new PgBoss({
    connectionString: url,
    migrate: true,
    createSchema: true,
  });
  try {
    await boss.start();
    await bootstrapQueues(boss);
  } finally {
    await boss.stop();
  }
}
