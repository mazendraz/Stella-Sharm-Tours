import { and, eq, inArray, isNull, lt, sql, type SQL } from 'drizzle-orm';
import type { Database } from '@stella/db';
import * as s from '@stella/db/schema';
import { requestRetentionCutoff } from '@stella/shared/retention';
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
/** Remove historical copies too; never create an Undo snapshot of erased PII. */
export async function scrubRequestHistory(tx: Transaction, filter: SQL) {
  const ids = tx
    .select({ id: s.bookingRequests.id })
    .from(s.bookingRequests)
    .where(filter);
  const textIds = tx
    .select({ id: sql<string>`${s.bookingRequests.id}::text`.as('id') })
    .from(s.bookingRequests)
    .where(filter);
  await tx
    .delete(s.revisions)
    .where(
      and(
        eq(s.revisions.entity, 'request'),
        inArray(s.revisions.entityId, ids),
      ),
    );
  await tx
    .update(s.auditLog)
    .set({ before: null, after: { redacted: true } })
    .where(
      and(
        eq(s.auditLog.entity, 'request'),
        inArray(s.auditLog.entityId, textIds),
      ),
    );
  await tx
    .delete(s.outbox)
    .where(
      and(
        inArray(s.outbox.name, [
          'notify.request.created',
          'notify.request.push',
        ]),
        inArray(sql<string>`${s.outbox.data}->>'requestId'`, textIds),
      ),
    );
}
export async function anonymizeExpiredRequests(db: Database) {
  const cutoff = requestRetentionCutoff();
  return db.transaction(async (tx) => {
    const filter = lt(s.bookingRequests.createdAt, cutoff);
    await tx
      .select({ id: s.bookingRequests.id })
      .from(s.bookingRequests)
      .where(filter)
      .for('update');
    // Include already-anonymized rows when removing old historical copies.
    await scrubRequestHistory(tx, filter);
    const changed = await tx
      .update(s.bookingRequests)
      .set({
        name: '[removed]',
        phone: '[removed]',
        email: null,
        hotel: null,
        notes: null,
        internalNote: null,
        childAges: null,
        ipHash: null,
        userAgent: null,
        anonymizedAt: new Date(),
      })
      .where(and(filter, isNull(s.bookingRequests.anonymizedAt)))
      .returning({ id: s.bookingRequests.id });
    return changed.length;
  });
}
