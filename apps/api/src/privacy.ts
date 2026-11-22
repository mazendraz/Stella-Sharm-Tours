import { sql, type SQL } from 'drizzle-orm';
import type { Database } from '@stella/db';
import * as s from '@stella/db/schema';
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
/** Remove historical copies too; never create an Undo snapshot of erased PII. */
export async function scrubRequestHistory(tx: Transaction, filter: SQL) {
  const ids = tx
    .select({ id: s.bookingRequests.id })
    .from(s.bookingRequests)
    .where(filter);
  await tx.execute(sql`select public.scrub_request_history(array(${ids}))`);
}
