import { sql } from 'drizzle-orm';
import type { Database } from '@stella/db';
import { rateBuckets } from '@stella/db/schema';
export async function consume(
  db: Database,
  key: string,
  limit: number,
  seconds: number,
) {
  const [row] = await db
    .insert(rateBuckets)
    .values({ key, count: 1, expiresAt: new Date(Date.now() + seconds * 1000) })
    .onConflictDoUpdate({
      target: rateBuckets.key,
      set: {
        count: sql`case when ${rateBuckets.expiresAt} <= now() then 1 else ${rateBuckets.count}+1 end`,
        expiresAt: sql`case when ${rateBuckets.expiresAt} <= now() then now()+${seconds}*interval '1 second' else ${rateBuckets.expiresAt} end`,
      },
    })
    .returning();
  return row!.count <= limit;
}
