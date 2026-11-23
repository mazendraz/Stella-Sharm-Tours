import { and, inArray, isNull, lte, sql, type SQL } from 'drizzle-orm';
import type { Database } from '@stella/db';
import * as s from '@stella/db/schema';
import { hashPrivate } from './requests';
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export async function scrubRequestHistory(tx: Transaction, filter: SQL) {
  const ids = tx
    .select({ id: s.bookingRequests.id })
    .from(s.bookingRequests)
    .where(filter);
  await tx.execute(sql`select public.scrub_request_history(array(${ids}))`);
}

/** Ledger key for an erased phone number: a keyed hash, never the number. */
export const erasureHash = (phone: string, salt: string) =>
  hashPrivate('erasure:' + phone, salt);

/** Deletes a customer's requests and history; used by erasure and its re-application. */
export async function eraseRequests(tx: Transaction, filter: SQL) {
  // Serialize with request edits and notification deliveries before scrubbing.
  await tx
    .select({ id: s.bookingRequests.id })
    .from(s.bookingRequests)
    .where(filter)
    .for('update');
  await scrubRequestHistory(tx, filter);
  return tx
    .delete(s.bookingRequests)
    .where(filter)
    .returning({ id: s.bookingRequests.id });
}

/**
 * Re-applies recorded erasures (audit SEC-10). After a backup is restored,
 * requests erased since that backup would otherwise come back. Only requests
 * created at or before the erasure are removed, so a customer who books again
 * later keeps the new booking. Returns the number of requests removed.
 */
export async function reapplyErasures(db: Database, salt: string) {
  const ledger = new Map(
    (await db.select().from(s.privacyErasures)).map((row) => [
      row.phoneHash,
      row.erasedAt,
    ]),
  );
  if (!ledger.size) return 0;
  const phones = await db
    .selectDistinct({ phone: s.bookingRequests.phone })
    .from(s.bookingRequests)
    .where(isNull(s.bookingRequests.anonymizedAt));
  let removed = 0;
  for (const { phone } of phones) {
    const erasedAt = ledger.get(erasureHash(phone, salt));
    if (!erasedAt) continue;
    removed += (
      await db.transaction(
        (tx) =>
          eraseRequests(
            tx,
            and(
              inArray(s.bookingRequests.phone, [phone]),
              lte(s.bookingRequests.createdAt, erasedAt),
            )!,
          ),
        { isolationLevel: 'repeatable read' },
      )
    ).length;
  }
  return removed;
}
