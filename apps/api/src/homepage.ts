import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import type { Hono } from 'hono';
import type { Database } from '@stella/db';
import * as s from '@stella/db/schema';
import { localizedSchema, can } from '@stella/shared/admin';
import type { ApiEnv } from './types';
import type { Config } from './config';
import type { authService } from './auth';
import { recordChange } from './admin';
import { readSettings } from './catalog';
import { fail } from './errors';
const slugs = z
  .array(z.string().regex(/^[a-z0-9-]{1,120}$/))
  .max(38)
  .refine((v) => new Set(v).size === v.length);
export const homepageSchema = z.strictObject({
  home: z.strictObject({
    private_heading: localizedSchema,
    private_text: localizedSchema,
    build_heading: localizedSchema,
    build_text: localizedSchema,
    contact_heading: localizedSchema,
    contact_text: localizedSchema,
    private_trip_slugs: slugs.optional(),
    featured_trip_slugs: slugs.max(4).optional(),
  }),
  how_steps: z
    .array(z.strictObject({ title: localizedSchema, text: localizedSchema }))
    .length(3),
  private_perks: z
    .array(z.strictObject({ title: localizedSchema, sub: localizedSchema }))
    .length(4),
  publish: z.boolean().default(false),
});
export function registerHomepage(
  app: Hono<ApiEnv>,
  db: Database,
  cfg: Config,
  auth: ReturnType<typeof authService>,
) {
  app.get('/v1/admin/homepage', auth.guard('content'), async (c) => {
    const settings = await readSettings(db),
      [collection] = await db
        .select()
        .from(s.collections)
        .where(eq(s.collections.kind, 'private_virtual'));
    return c.json({
      home: settings.home,
      how_steps: settings.how_steps,
      private_perks: collection?.perks ?? [],
      draft: settings.homepage_draft ?? null,
    });
  });
  app.put('/v1/admin/homepage', auth.guard('content'), async (c) => {
    const input = await auth.parse(c, homepageSchema);
    if (input.publish && !can(c.get('principal').role, 'publish'))
      fail(403, 'FORBIDDEN');
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('homepage'))`);
      const selected = [
        ...(input.home.private_trip_slugs ?? []),
        ...(input.home.featured_trip_slugs ?? []),
      ];
      const trips = selected.length
        ? await tx.select().from(s.trips).where(inArray(s.trips.slug, selected))
        : [];
      if (
        selected.some(
          (slug) =>
            !trips.some(
              (t) =>
                t.slug === slug && t.status === 'published' && !t.archivedAt,
            ),
        )
      )
        fail(422, 'TRIP_NOT_PUBLISHED');
      if (
        input.home.private_trip_slugs?.some(
          (slug) => !trips.some((t) => t.slug === slug && t.format !== 'group'),
        )
      )
        fail(422, 'PRIVATE_TRIP_REQUIRED');
      const save = async (key: string, value: unknown) => {
        const [before] = await tx
          .select()
          .from(s.settings)
          .where(eq(s.settings.key, key))
          .for('update');
        await tx
          .insert(s.settings)
          .values({
            key,
            value: value ?? sql`'null'::jsonb`,
            updatedBy: c.get('principal').id,
          })
          .onConflictDoUpdate({
            target: s.settings.key,
            set: {
              value: value ?? sql`'null'::jsonb`,
              updatedAt: new Date(),
              updatedBy: c.get('principal').id,
            },
          });
        await recordChange(
          tx,
          c,
          cfg,
          'settings',
          randomUUID(),
          { key, value: before?.value ?? null },
          { key, value },
        );
      };
      if (!input.publish) {
        await save('homepage_draft', input);
        return;
      }
      await save('home', input.home);
      await save('how_steps', input.how_steps);
      const [collection] = await tx
        .select()
        .from(s.collections)
        .where(eq(s.collections.kind, 'private_virtual'))
        .for('update');
      if (!collection) fail(422, 'PRIVATE_COLLECTION_REQUIRED');
      await tx
        .update(s.collections)
        .set({ perks: input.private_perks, updatedAt: new Date() })
        .where(eq(s.collections.id, collection.id));
      await recordChange(tx, c, cfg, 'collection', collection.id, collection, {
        ...collection,
        perks: input.private_perks,
      });
      await save('homepage_draft', null);
    });
    return c.json({ ok: true, published: input.publish });
  });
}
