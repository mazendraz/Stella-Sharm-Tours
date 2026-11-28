import { and, eq, isNull } from 'drizzle-orm';
import type { Hono } from 'hono';
import type { Database } from '@stella/db';
import * as s from '@stella/db/schema';
import { verificationInput } from '@stella/shared/verification';
import type { ApiEnv } from './types';
import type { Config } from './config';
import type { authService } from './auth';
import { clientIp } from './auth';
import { hashPrivate } from './requests';
import { fail } from './errors';

/**
 * Verification Center answers. Reading needs `content`; recording an answer
 * is an owner/manager decision (`publish`). Answers are internal and never
 * appear on the public site.
 */
export function registerVerification(
  app: Hono<ApiEnv>,
  db: Database,
  cfg: Config,
  auth: ReturnType<typeof authService>,
) {
  app.get('/v1/admin/verification', auth.guard('content'), async (c) => {
    const rows = await db.select().from(s.verificationFacts);
    return c.json({
      facts: rows.map((r) => ({
        tripId: r.tripId,
        topic: r.topic,
        status: r.status,
        note: r.note,
        updatedAt: r.updatedAt.toISOString(),
      })),
    });
  });

  app.put('/v1/admin/verification', auth.guard('publish'), async (c) => {
    const b = verificationInput.parse(await c.req.json());
    await db.transaction(async (tx) => {
      if (b.tripId) {
        const [trip] = await tx
          .select({ id: s.trips.id })
          .from(s.trips)
          .where(eq(s.trips.id, b.tripId));
        if (!trip) fail(404, 'NOT_FOUND');
      }
      const scope = and(
        b.tripId
          ? eq(s.verificationFacts.tripId, b.tripId)
          : isNull(s.verificationFacts.tripId),
        eq(s.verificationFacts.topic, b.topic),
      );
      const [before] = await tx
        .select()
        .from(s.verificationFacts)
        .where(scope)
        .for('update');
      const values = {
        status: b.status,
        note: b.note || null,
        updatedBy: c.get('principal').id,
        updatedAt: new Date(),
      };
      if (before) await tx.update(s.verificationFacts).set(values).where(scope);
      else
        await tx
          .insert(s.verificationFacts)
          .values({ tripId: b.tripId, topic: b.topic, ...values });
      await tx.insert(s.auditLog).values({
        userId: c.get('principal').id,
        action: 'update',
        entity: 'verification_fact',
        entityId: b.tripId,
        before: before ? { topic: before.topic, status: before.status } : null,
        after: { topic: b.topic, status: b.status },
        ipHash: hashPrivate(clientIp(c, cfg), cfg.IP_HASH_SALT),
      });
    });
    return c.json({ ok: true });
  });
}
