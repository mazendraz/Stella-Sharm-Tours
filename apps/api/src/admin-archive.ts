import { and, eq, isNull } from 'drizzle-orm';
import { hashPrivate } from './requests';
import { clientIp } from './auth';
import { z } from 'zod';
import type { Hono } from 'hono';
import type { Database } from '@stella/db';
import * as s from '@stella/db/schema';
import type { ApiEnv } from './types';
import type { Config } from './config';
import type { authService } from './auth';
import { recordChange } from './admin';
import { fail } from './errors';

const uuid = (value: string | undefined) => {
  if (!z.uuid().safeParse(value).success) fail(422, 'INVALID_ID');
  return value!;
};

/**
 * Archive / unarchive (§9.1). Archived items disappear from the website and from
 * admin lists (lists accept ?archived=1). Each change records a revision so the
 * toast's Undo — and History → Restore — can reverse it.
 */
export function registerArchive(
  app: Hono<ApiEnv>,
  db: Database,
  cfg: Config,
  auth: ReturnType<typeof authService>,
) {
  // Owners can end one session of a teammate (the list already exists).
  app.delete(
    '/v1/admin/users/:id/sessions/:sid',
    auth.guard('users'),
    async (c) => {
      auth.recent(c);
      const id = uuid(c.req.param('id')),
        sessionId = c.req.param('sid');
      if (!/^[a-f0-9]{64}$/.test(sessionId)) fail(422, 'INVALID_ID');
      await db.transaction(async (tx) => {
        await tx
          .delete(s.sessions)
          .where(and(eq(s.sessions.id, sessionId), eq(s.sessions.userId, id)));
        await tx.insert(s.auditLog).values({
          userId: c.get('principal').id,
          action: 'logout_session',
          entity: 'user',
          entityId: id,
          ipHash: hashPrivate(clientIp(c, cfg), cfg.IP_HASH_SALT),
        });
      });
      return c.json({ ok: true });
    },
  );
  // Anyone can change their own display name.
  app.patch('/v1/admin/me', auth.guard(), async (c) => {
    const b = await auth.parse(
      c,
      z.strictObject({ name: z.string().trim().min(1).max(80) }),
    );
    const id = c.get('principal').id;
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select({ name: s.adminUsers.name })
        .from(s.adminUsers)
        .where(eq(s.adminUsers.id, id))
        .for('update');
      if (!before) fail(404, 'NOT_FOUND');
      if (before.name === b.name) return;
      await tx
        .update(s.adminUsers)
        .set({ name: b.name })
        .where(eq(s.adminUsers.id, id));
      await tx.insert(s.auditLog).values({
        userId: id,
        action: 'update',
        entity: 'user',
        entityId: id,
        before: { name: before.name },
        after: { name: b.name },
      });
    });
    return c.json({ ok: true });
  });
  // Collections had publish only; unpublish returns a collection to draft.
  app.post(
    '/v1/admin/collections/:id/unpublish',
    auth.guard('publish'),
    async (c) => {
      const id = uuid(c.req.param('id'));
      await db.transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(s.collections)
          .where(eq(s.collections.id, id))
          .for('update');
        if (!before) fail(404, 'NOT_FOUND');
        if (before.kind !== 'normal') fail(409, 'COLLECTION_PROTECTED');
        await tx
          .update(s.collections)
          .set({ status: 'draft', updatedAt: new Date() })
          .where(eq(s.collections.id, id));
        await recordChange(
          tx,
          c,
          cfg,
          'collection',
          id,
          before,
          { ...before, status: 'draft' },
          'unpublish',
        );
      });
      return c.json({ ok: true });
    },
  );
  for (const action of ['archive', 'unarchive'] as const) {
    const archivedAt = () => (action === 'archive' ? new Date() : null);
    // Trips and packages share the trips table.
    app.post(
      '/v1/admin/trips/:id/' + action,
      auth.guard('publish'),
      async (c) => {
        const id = uuid(c.req.param('id'));
        await db.transaction(async (tx) => {
          const [before] = await tx
            .select()
            .from(s.trips)
            .where(eq(s.trips.id, id))
            .for('update');
          if (!before) fail(404, 'NOT_FOUND');
          const value = archivedAt();
          await tx
            .update(s.trips)
            .set({ archivedAt: value, updatedAt: new Date() })
            .where(eq(s.trips.id, id));
          await recordChange(
            tx,
            c,
            cfg,
            'trip',
            id,
            {
              section: 'archive',
              values: { archivedAt: before.archivedAt?.toISOString() ?? null },
            },
            { archivedAt: value },
            action,
          );
        });
        return c.json({ ok: true });
      },
    );
    app.post(
      '/v1/admin/collections/:id/' + action,
      auth.guard('publish'),
      async (c) => {
        const id = uuid(c.req.param('id'));
        await db.transaction(async (tx) => {
          const [before] = await tx
            .select()
            .from(s.collections)
            .where(eq(s.collections.id, id))
            .for('update');
          if (!before) fail(404, 'NOT_FOUND');
          if (before.kind !== 'normal') fail(409, 'COLLECTION_PROTECTED');
          if (action === 'archive') {
            const [trip] = await tx
              .select({ id: s.trips.id })
              .from(s.trips)
              .where(
                and(eq(s.trips.collectionId, id), isNull(s.trips.archivedAt)),
              )
              .limit(1);
            if (trip) fail(409, 'COLLECTION_NOT_EMPTY');
          }
          const value = archivedAt();
          await tx
            .update(s.collections)
            .set({
              archivedAt: value,
              ...(value ? { status: 'draft' as const } : {}),
              updatedAt: new Date(),
            })
            .where(eq(s.collections.id, id));
          await recordChange(
            tx,
            c,
            cfg,
            'collection',
            id,
            before,
            { ...before, archivedAt: value },
            action,
          );
        });
        return c.json({ ok: true });
      },
    );
    app.post(
      '/v1/admin/hero-slides/:id/' + action,
      auth.guard('heroLive'),
      async (c) => {
        const id = uuid(c.req.param('id'));
        await db.transaction(async (tx) => {
          const [before] = await tx
            .select()
            .from(s.heroSlides)
            .where(eq(s.heroSlides.id, id))
            .for('update');
          if (!before) fail(404, 'NOT_FOUND');
          const value = archivedAt();
          await tx
            .update(s.heroSlides)
            .set({
              archivedAt: value,
              ...(value ? { status: 'draft' as const } : {}),
              updatedAt: new Date(),
            })
            .where(eq(s.heroSlides.id, id));
          await recordChange(
            tx,
            c,
            cfg,
            'hero_slide',
            id,
            before,
            { ...before, archivedAt: value },
            action,
          );
        });
        return c.json({ ok: true });
      },
    );
    app.post(
      '/v1/admin/faqs/:id/' + action,
      auth.guard('publish'),
      async (c) => {
        const id = uuid(c.req.param('id'));
        await db.transaction(async (tx) => {
          const [before] = await tx
            .select()
            .from(s.faqs)
            .where(eq(s.faqs.id, id))
            .for('update');
          if (!before) fail(404, 'NOT_FOUND');
          const value = archivedAt();
          await tx
            .update(s.faqs)
            .set({
              archivedAt: value,
              ...(value ? { status: 'draft' as const } : {}),
            })
            .where(eq(s.faqs.id, id));
          await recordChange(
            tx,
            c,
            cfg,
            'faq',
            id,
            before,
            { ...before, archivedAt: value },
            action,
            ['faq'],
          );
        });
        return c.json({ ok: true });
      },
    );
  }
}
