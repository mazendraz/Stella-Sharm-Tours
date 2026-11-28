import { desc, eq } from 'drizzle-orm';
import type { Context, Hono } from 'hono';
import type { Database } from '@stella/db';
import * as s from '@stella/db/schema';
import {
  visibilityImport,
  visibilityRow,
  type VisibilityRow,
} from '@stella/shared/visibility';
import type { ApiEnv } from './types';
import type { Config } from './config';
import type { authService } from './auth';
import { clientIp } from './auth';
import { hashPrivate } from './requests';
import { fail } from './errors';

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const toDb = (r: VisibilityRow, userId: string) => ({
  measuredOn: r.measuredOn,
  platform: r.platform,
  kind: r.kind,
  promptId: r.promptId ?? null,
  query: r.query,
  lang: r.lang,
  market: r.market ?? null,
  branded: r.branded,
  mentioned: r.mentioned,
  citedUrl: r.citedUrl ?? null,
  recommendedPosition: r.recommendedPosition ?? null,
  organicPosition: r.organicPosition ?? null,
  competitors: r.competitors,
  sources: r.sources,
  notes: r.notes ?? null,
  createdBy: userId,
});

/** Manual visibility records. No scraping, no estimates. */
export function registerVisibility(
  app: Hono<ApiEnv>,
  db: Database,
  cfg: Config,
  auth: ReturnType<typeof authService>,
) {
  const audit = (
    tx: Pick<Database, 'insert'>,
    c: Context<ApiEnv>,
    action: string,
    entityId: string | null,
    after: object,
  ) =>
    tx.insert(s.auditLog).values({
      userId: c.get('principal').id,
      action,
      entity: 'visibility_measurement',
      entityId,
      after,
      ipHash: hashPrivate(clientIp(c, cfg), cfg.IP_HASH_SALT),
    });
  app.get('/v1/admin/visibility', auth.guard('content'), async (c) =>
    c.json(
      (
        await db
          .select()
          .from(s.visibilityMeasurements)
          .orderBy(desc(s.visibilityMeasurements.measuredOn))
          .limit(10000)
      ).map((r) => ({
        id: r.id,
        measuredOn: r.measuredOn,
        platform: r.platform,
        kind: r.kind,
        promptId: r.promptId,
        query: r.query,
        lang: r.lang,
        market: r.market,
        branded: r.branded,
        mentioned: r.mentioned,
        citedUrl: r.citedUrl,
        recommendedPosition: r.recommendedPosition,
        organicPosition: r.organicPosition,
        competitors: r.competitors,
        sources: r.sources,
        notes: r.notes,
      })),
    ),
  );
  app.post('/v1/admin/visibility', auth.guard('content'), async (c) => {
    const row = visibilityRow.parse(await c.req.json());
    const [created] = await db
      .insert(s.visibilityMeasurements)
      .values(toDb(row, c.get('principal').id))
      .returning({ id: s.visibilityMeasurements.id });
    return c.json({ id: created!.id }, 201);
  });
  app.post('/v1/admin/visibility/import', auth.guard('content'), async (c) => {
    const { rows } = visibilityImport.parse(await c.req.json());
    await db.transaction(async (tx) => {
      await tx
        .insert(s.visibilityMeasurements)
        .values(rows.map((r) => toDb(r, c.get('principal').id)));
      await audit(tx, c, 'import', null, { rows: rows.length });
    });
    return c.json({ imported: rows.length }, 201);
  });
  app.delete('/v1/admin/visibility/:id', auth.guard('publish'), async (c) => {
    const id = c.req.param('id');
    if (!uuidRe.test(id)) fail(404, 'NOT_FOUND');
    await db.transaction(async (tx) => {
      const deleted = await tx
        .delete(s.visibilityMeasurements)
        .where(eq(s.visibilityMeasurements.id, id))
        .returning({
          id: s.visibilityMeasurements.id,
          platform: s.visibilityMeasurements.platform,
          measuredOn: s.visibilityMeasurements.measuredOn,
        });
      if (!deleted.length) fail(404, 'NOT_FOUND');
      await audit(tx, c, 'delete', id, {
        platform: deleted[0]!.platform,
        measuredOn: deleted[0]!.measuredOn,
      });
    });
    return c.json({ ok: true });
  });
}
