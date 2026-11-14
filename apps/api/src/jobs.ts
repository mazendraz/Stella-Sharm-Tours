import { PgBoss } from 'pg-boss';
import { z } from 'zod';
import { and, eq, isNull, lt, sql } from 'drizzle-orm';
import { readdir, stat, rm } from 'node:fs/promises';
import type { Database, connectDatabase } from '@stella/db';
import * as s from '@stella/db/schema';
import { inside, processMedia } from './media';
import { unseal } from './auth';
import { operationsCopy } from '@stella/shared/i18n/operations';
import { newDeviceCopy } from '@stella/shared/i18n/security-notifications';
import { bundledCoreText } from '@stella/shared/i18n/core-content';
import { anonymizeExpiredRequests } from './privacy';
import { requestRetentionCutoff } from '@stella/shared/retention';
import { notifyPush } from './push';
import {
  translatePublic,
  refreshCoverage,
  configuredProviders,
  type WorkerConfig,
} from './translate';
export const queueNames = [
  'media.process',
  'notify.request.created',
  'notify.request.push',
  'auth.reset',
  'auth.invite',
  'auth.new_device',
  'revalidate.web',
  'cleanup.media',
  'cleanup.sessions',
  'privacy.purge_requests',
  'i18n.translate_entity',
  'i18n.backfill_locale',
  'i18n.refresh_stale',
  'notify.translation.budget',
  'notify.prices.weekly',
  'notify.operations.weekly',
] as const;
export async function bootstrapQueues(boss: PgBoss) {
  for (const name of queueNames)
    await boss.createQueue(name, {
      retryLimit: 5,
      retryDelay: 30,
      retryBackoff: true,
      expireInSeconds: 300,
    });
}
export async function dispatchOutbox(
  pool: ReturnType<typeof connectDatabase>['pool'],
  boss: PgBoss,
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const rows = await client.query<{
      id: string;
      name: string;
      data: unknown;
    }>(
      'select id,name,data from outbox where delivered_at is null order by created_at for update skip locked limit 30',
    );
    for (const row of rows.rows) {
      if (!(queueNames as readonly string[]).includes(row.name))
        throw new Error('Unknown outbox task');
      const data = z.record(z.string(), z.unknown()).parse(row.data);
      const options = {
        db: { executeSql: (text, values) => client.query(text, values) },
        retryLimit: 5,
        retryDelay: 30,
        retryBackoff: true,
      } satisfies NonNullable<Parameters<PgBoss['send']>[2]>;
      if (row.name === 'i18n.translate_entity') {
        delete data.fields;
        await boss.sendDebounced(
          row.name,
          data,
          options,
          30,
          [data.entity, data.id, data.locale ?? 'all'].join(':'),
        );
      } else await boss.send(row.name, data, options);
      await client.query('update outbox set delivered_at=now() where id=$1', [
        row.id,
      ]);
    }
    await client.query('COMMIT');
    return rows.rowCount ?? 0;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
export type Mailer = {
  sendMail: (message: {
    from: string;
    to: string;
    subject: string;
    text: string;
    messageId?: string;
  }) => Promise<unknown>;
};
export async function notifyNewDevice(
  db: Database,
  cfg: WorkerConfig,
  userId: string,
  deviceId: string,
  mailer: Mailer,
) {
  const [record] = await db
    .select({ device: s.adminDevices, email: s.adminUsers.email })
    .from(s.adminDevices)
    .innerJoin(s.adminUsers, eq(s.adminDevices.userId, s.adminUsers.id))
    .where(
      and(
        eq(s.adminDevices.id, deviceId),
        eq(s.adminDevices.userId, userId),
        isNull(s.adminUsers.disabledAt),
      ),
    );
  if (!record || record.device.expiresAt <= new Date()) return;
  const copy = newDeviceCopy[cfg.OWNER_REPORT_LOCALE];
  const time = new Intl.DateTimeFormat(cfg.OWNER_REPORT_LOCALE, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Cairo',
  }).format(record.device.createdAt);
  await mailer.sendMail({
    from: cfg.SMTP_FROM,
    to: record.email,
    messageId: `<device-${deviceId}@stella.local>`,
    subject: copy.subject,
    text: [
      copy.body,
      time,
      copy.action,
      new URL('/account/sessions', cfg.ADMIN_ORIGIN).href,
    ].join('\n\n'),
  });
}
export async function notifyWeeklyOperations(
  db: Database,
  cfg: WorkerConfig,
  mailer: Mailer,
) {
  const days = await db.execute(sql`
    select to_char(d.day, 'YYYY-MM-DD') as day, count(r.id)::int as count
    from generate_series(date_trunc('day', now() at time zone 'Africa/Cairo') - interval '6 days', date_trunc('day', now() at time zone 'Africa/Cairo'), interval '1 day') as d(day)
    left join booking_requests r on (r.created_at at time zone 'Africa/Cairo')::date=d.day::date and r.status<>'spam'
    group by d.day order by d.day
  `);
  const top = await db.execute(sql`
    select t.title, count(*)::int as count
    from booking_request_items i join booking_requests r on r.id=i.request_id join trips t on t.id=i.trip_id
    where r.created_at >= (date_trunc('day', now() at time zone 'Africa/Cairo') - interval '6 days') at time zone 'Africa/Cairo' and r.status<>'spam'
    group by t.id, t.title order by count(*) desc, t.slug limit 10
  `);
  const locale = cfg.OWNER_REPORT_LOCALE;
  const copy = operationsCopy[locale];
  const trips = top.rows.map((row) => {
    const title = row.title as import('@stella/db/schema').Localized;
    return `${title[locale] ?? bundledCoreText(title.en, locale) ?? title.en}: ${Number(row.count)}`;
  });
  const text = [
    copy.requests,
    ...days.rows.map((row) => `${String(row.day)}: ${Number(row.count)}`),
    '',
    copy.trips,
    ...(trips.length ? trips : [copy.empty]),
    '',
    copy.errors,
  ].join('\n');
  const owners = await db
    .select({ id: s.adminUsers.id, email: s.adminUsers.email })
    .from(s.adminUsers)
    .where(
      and(eq(s.adminUsers.role, 'owner'), isNull(s.adminUsers.disabledAt)),
    );
  for (const owner of owners)
    await mailer.sendMail({
      from: cfg.SMTP_FROM,
      to: owner.email,
      messageId: `<operations-${new Date().toISOString().slice(0, 10)}-${owner.id}@stella.local>`,
      subject: copy.subject,
      text,
    });
}
export async function notifyWeeklyPrices(
  db: Database,
  cfg: WorkerConfig,
  mailer: Mailer,
) {
  const changes = await db
    .select()
    .from(s.auditLog)
    .where(
      and(
        sql`${s.auditLog.at}>now()-interval '7 days'`,
        sql`(${s.auditLog.entity}='trip_prices' or (${s.auditLog.entity}='trip' and (coalesce(${s.auditLog.before}->'values','{}'::jsonb) ? 'privateSurchargePct' or coalesce(${s.auditLog.after},'{}'::jsonb) ? 'privateSurchargePct')))`,
      ),
    )
    .orderBy(s.auditLog.at);
  if (!changes.length) return;
  const owners = await db
    .select({ id: s.adminUsers.id, email: s.adminUsers.email })
    .from(s.adminUsers)
    .where(
      and(eq(s.adminUsers.role, 'owner'), isNull(s.adminUsers.disabledAt)),
    );
  const week = new Date().toISOString().slice(0, 10);
  for (const owner of owners)
    await mailer.sendMail({
      from: cfg.SMTP_FROM,
      to: owner.email,
      messageId: `<prices-${week}-${owner.id}@stella.local>`,
      subject: 'Stella weekly price changes',
      text: changes
        .map(
          (row) =>
            `${row.at.toISOString()} | ${row.entity} | ${row.action} | ${row.entityId}\nBefore: ${JSON.stringify(row.before)}\nAfter: ${JSON.stringify(row.after)}`,
        )
        .join('\n\n'),
    });
}
export async function notifyRequest(
  db: Database,
  cfg: WorkerConfig,
  requestId: string,
  mailer: Mailer,
) {
  return db.transaction(async (tx) => {
    const [r] = await tx
      .select()
      .from(s.bookingRequests)
      .where(eq(s.bookingRequests.id, requestId))
      .for('share');
    if (
      !r ||
      r.anonymizedAt ||
      r.status === 'spam' ||
      r.createdAt < requestRetentionCutoff()
    )
      return;
    const items = await tx
      .select({ title: s.trips.title, day: s.bookingRequestItems.dayIndex })
      .from(s.bookingRequestItems)
      .innerJoin(s.trips, eq(s.bookingRequestItems.tripId, s.trips.id))
      .where(eq(s.bookingRequestItems.requestId, requestId));
    await mailer.sendMail({
      from: cfg.SMTP_FROM,
      to: cfg.STAFF_NOTIFY_EMAIL,
      messageId: `<${r.id}@stella.local>`,
      subject: `New request ${r.ref}`,
      text: [
        r.ref,
        `Name: ${r.name}`,
        `Phone: ${r.phone}`,
        `Email: ${r.email ?? ''}`,
        `Date: ${r.startDate}`,
        `Guests: ${r.adults} adults, ${r.children} children`,
        `Format: ${r.format}`,
        `Pickup: ${r.pickupArea ?? ''} ${r.hotel ?? ''}`,
        `Estimate: ${r.estimateEur === null ? 'On request' : r.estimateEur + ' EUR'}`,
        ...items.map((i) => `Day ${i.day}: ${i.title.en}`),
        `Notes: ${r.notes ?? ''}`,
        new URL('/requests/' + r.id, cfg.ADMIN_ORIGIN).href,
      ].join('\n'),
    });
  });
}
export async function revalidateWeb(
  db: Database,
  cfg: WorkerConfig,
  tags: string[],
  send: typeof fetch = fetch,
) {
  const values = new Set(tags);
  if (
    tags.includes('collections') ||
    tags.some((t) => t.startsWith('trip:') || t.startsWith('collection:'))
  ) {
    for (const t of await db.select({ slug: s.trips.slug }).from(s.trips))
      values.add('trip:' + t.slug);
    for (const c of await db
      .select({ slug: s.collections.slug })
      .from(s.collections))
      values.add('collection:' + c.slug);
    values.add('site');
    values.add('collections');
  }
  if (tags.includes('faq') || tags.includes('site'))
    for (const key of ['terms', 'privacy', 'cancellation', 'contact'])
      values.add('page:' + key);
  const safe = [...values].filter((t) =>
    /^(site|collections|faq|locales|collection:[a-z0-9-]{1,120}|trip:[a-z0-9-]{1,120}|page:[a-z-]{1,40}|ui:[a-z-]{2,16})$/.test(
      t,
    ),
  );
  for (let i = 0; i < safe.length; i += 40) {
    const response = await send(cfg.WEB_REVALIDATE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Revalidate-Secret': cfg.WEB_REVALIDATE_SECRET,
      },
      body: JSON.stringify({ tags: safe.slice(i, i + 40) }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('Web revalidation failed');
  }
}
export async function purgeRequests(db: Database) {
  return anonymizeExpiredRequests(db);
}
export async function cleanupSessions(db: Database) {
  await db
    .delete(s.adminDevices)
    .where(lt(s.adminDevices.expiresAt, new Date()));
  await db
    .delete(s.sessions)
    .where(
      sql`${s.sessions.expiresAt}<now() or ${s.sessions.lastSeenAt}<now()-interval '8 hours'`,
    );
  await db.delete(s.authTokens).where(lt(s.authTokens.expiresAt, new Date()));
  await db.delete(s.rateBuckets).where(lt(s.rateBuckets.expiresAt, new Date()));
  await db
    .delete(s.outbox)
    .where(sql`${s.outbox.deliveredAt}<now()-interval '30 days'`);
}
export async function cleanupMedia(db: Database, cfg: WorkerConfig) {
  const referenced = new Set<string>();
  const collect = (v: unknown) => {
    if (typeof v === 'string' && /^[a-f0-9]{2}\/[a-f0-9]{64}\//.test(v))
      referenced.add(v.split('/').slice(0, 2).join('/'));
    else if (Array.isArray(v)) v.forEach(collect);
    else if (v && typeof v === 'object') Object.values(v).forEach(collect);
  };
  for (const m of await db
    .select()
    .from(s.media)
    .where(isNull(s.media.archivedAt)))
    collect(m.variants);
  for (const r of await db
    .select()
    .from(s.revisions)
    .where(sql`${s.revisions.createdAt}>now()-interval '30 days'`))
    collect(r.snapshot);
  for (const root of [cfg.MEDIA_ROOT, inside(cfg.ORIGINALS_ROOT, 'previews')]) {
    let prefixes;
    try {
      prefixes = await readdir(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const prefix of prefixes) {
      if (!prefix.isDirectory() || !/^[a-f0-9]{2}$/.test(prefix.name)) continue;
      for (const entry of await readdir(inside(root, prefix.name), {
        withFileTypes: true,
      })) {
        if (!entry.isDirectory() || !/^[a-f0-9]{64}$/.test(entry.name))
          continue;
        const key = prefix.name + '/' + entry.name;
        if (referenced.has(key)) continue;
        const target = inside(root, key);
        if ((await stat(target)).mtimeMs < Date.now() - 30 * 86400000)
          await rm(target, { recursive: true, force: true });
      }
    }
  }
  const archived = await db
    .select()
    .from(s.media)
    .where(
      sql`${s.media.archivedAt}<now()-interval '30 days' and not exists(select 1 from trip_media where media_id=${s.media.id}) and not exists(select 1 from collections where cover_media_id=${s.media.id} or hero_video_id=${s.media.id}) and not exists(select 1 from hero_slides where image_media_id=${s.media.id} or video_media_id=${s.media.id})`,
    );
  for (const m of archived) {
    if (!m.sha256 || !/^[a-f0-9]{64}$/.test(m.sha256)) continue;
    const path = inside(cfg.ORIGINALS_ROOT, 'originals', m.sha256);
    if (path === m.originalPath) await rm(path, { force: true });
  }
}
export async function startWorker(
  db: Database,
  pool: ReturnType<typeof connectDatabase>['pool'],
  cfg: WorkerConfig,
  mailer: Mailer,
  onError: (task: string) => void = () => {},
  onHealthy: () => Promise<void> = async () => {},
) {
  const boss = new PgBoss({
    connectionString: cfg.DATABASE_URL,
    migrate: false,
    createSchema: false,
  });
  boss.on('error', () => onError('queue'));
  await boss.start();
  {
    const queues = await boss.getQueues();
    if (queueNames.some((name) => !queues.some((q) => q.name === name)))
      throw new Error('Run jobs migration before starting production worker');
  }
  const providers = configuredProviders(cfg);
  await refreshCoverage(db, cfg, providers);
  if (providers.length)
    await boss.send(
      'i18n.refresh_stale',
      {},
      { singletonKey: 'startup-backfill', singletonSeconds: 300 },
    );
  for (const name of queueNames)
    await boss.work<unknown>(name, { batchSize: 1 }, async (jobs) => {
      for (const job of jobs) {
        if (name === 'media.process') {
          const b = z.strictObject({ mediaId: z.uuid() }).parse(job.data);
          await processMedia(db, cfg, b.mediaId);
          await revalidateWeb(db, cfg, ['site', 'collections']);
        } else if (name === 'notify.request.created') {
          const requestId = z
            .strictObject({ requestId: z.uuid() })
            .parse(job.data).requestId;
          await notifyRequest(db, cfg, requestId, mailer);
        } else if (name === 'notify.request.push')
          await notifyPush(
            db,
            cfg,
            z.strictObject({ requestId: z.uuid() }).parse(job.data).requestId,
          );
        else if (name === 'revalidate.web')
          await revalidateWeb(
            db,
            cfg,
            z
              .strictObject({ tags: z.array(z.string()).min(1).max(1000) })
              .parse(job.data).tags,
          );
        else if (name === 'auth.new_device') {
          const data = z
            .strictObject({ userId: z.uuid(), deviceId: z.uuid() })
            .parse(job.data);
          await notifyNewDevice(db, cfg, data.userId, data.deviceId, mailer);
        } else if (name === 'auth.reset' || name === 'auth.invite') {
          const b = z
              .strictObject({ userId: z.uuid(), token: z.string().max(1000) })
              .parse(job.data),
            [user] = await db
              .select()
              .from(s.adminUsers)
              .where(eq(s.adminUsers.id, b.userId));
          if (user && !user.disabledAt) {
            const token = unseal(
              Buffer.from(b.token, 'base64'),
              cfg.TOTP_ENC_KEY,
              user.id,
            );
            await mailer.sendMail({
              from: cfg.SMTP_FROM,
              to: user.email,
              subject:
                name === 'auth.invite'
                  ? 'Set up your Stella account'
                  : 'Reset your Stella password',
              text: new URL(
                '/auth/' +
                  (name === 'auth.invite' ? 'setup' : 'reset') +
                  '?token=' +
                  encodeURIComponent(token),
                cfg.ADMIN_ORIGIN,
              ).href,
            });
          }
        } else if (name === 'cleanup.sessions') await cleanupSessions(db);
        else if (name === 'privacy.purge_requests') await purgeRequests(db);
        else if (name === 'cleanup.media') await cleanupMedia(db, cfg);
        else if (name === 'i18n.backfill_locale')
          await translatePublic(
            db,
            cfg,
            z
              .strictObject({ locale: z.string().regex(/^[a-z]{2,3}$/) })
              .parse(job.data),
            providers,
          );
        else if (name === 'i18n.translate_entity')
          await translatePublic(
            db,
            cfg,
            z
              .strictObject({
                entity: z.string().max(40),
                id: z.string().max(120),
                locale: z
                  .string()
                  .regex(/^[a-z]{2,3}$/)
                  .optional(),
                fields: z.array(z.string().max(120)).max(100).optional(),
              })
              .parse(job.data),
            providers,
          );
        else if (name === 'i18n.refresh_stale')
          await translatePublic(db, cfg, {}, providers);
        else if (name === 'notify.operations.weekly')
          await notifyWeeklyOperations(db, cfg, mailer);
        else if (name === 'notify.prices.weekly')
          await notifyWeeklyPrices(db, cfg, mailer);
        else if (name === 'notify.translation.budget')
          await mailer.sendMail({
            from: cfg.SMTP_FROM,
            to: cfg.STAFF_NOTIFY_EMAIL,
            subject: 'Stella translation paused',
            text: 'The translation budget or free tier limit has been reached. Existing translations remain available. Review Languages in the admin.',
          });
      }
    });
  for (const [name, cron] of [
    ['cleanup.sessions', '0 * * * *'],
    ['cleanup.media', '0 3 * * 0'],
    ['privacy.purge_requests', '30 2 * * *'],
    ['i18n.refresh_stale', '0 4 * * *'],
    ['notify.prices.weekly', '0 9 * * 1'],
    ['notify.operations.weekly', '5 9 * * 1'],
  ] as const)
    await boss.schedule(name, cron, {}, { tz: 'Africa/Cairo' });
  let running = false;
  const dispatch = async () => {
    if (running) return;
    running = true;
    try {
      await dispatchOutbox(pool, boss);
      await onHealthy();
    } catch {
      onError('outbox');
    } finally {
      running = false;
    }
  };
  await dispatch();
  const timer = setInterval(() => void dispatch(), 1000);
  timer.unref();
  return {
    boss,
    stop: async () => {
      clearInterval(timer);
      while (running) await new Promise((r) => setTimeout(r, 20));
      await boss.stop({ graceful: true });
    },
  };
}
