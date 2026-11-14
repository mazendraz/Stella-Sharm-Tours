import { createHash } from 'node:crypto';
import { and, eq, isNull, inArray, ne, gt } from 'drizzle-orm';
import { z } from 'zod';
import webpush from 'web-push';
import type { Hono } from 'hono';
import type { Database } from '@stella/db';
import * as s from '@stella/db/schema';
import { locales } from '@stella/shared';
import type { ApiEnv } from './types';
import type { Config } from './config';
import type { WorkerConfig } from './translate';
import type { authService } from './auth';
import { fail } from './errors';
export function isPushEndpoint(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash &&
      (url.hostname === 'fcm.googleapis.com' ||
        url.hostname === 'updates.push.services.mozilla.com' ||
        url.hostname.endsWith('.push.services.mozilla.com') ||
        url.hostname === 'web.push.apple.com' ||
        url.hostname.endsWith('.notify.windows.com'))
    );
  } catch {
    return false;
  }
}
const endpoint = z.string().max(4096).refine(isPushEndpoint),
  hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const pushSubscriptionSchema = z.strictObject({
  endpoint,
  expirationTime: z.number().nullable().optional(),
  keys: z.strictObject({
    p256dh: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .refine((value) => Buffer.from(value, 'base64url').length === 65),
    auth: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .refine((value) => Buffer.from(value, 'base64url').length === 16),
  }),
  locale: z.enum(locales).default('en'),
});
export function registerPush(
  app: Hono<ApiEnv>,
  db: Database,
  cfg: Config,
  auth: ReturnType<typeof authService>,
) {
  app.get('/v1/admin/push/key', auth.guard('requests'), (c) =>
    c.json({ publicKey: cfg.VAPID_PUBLIC_KEY ?? null }),
  );
  app.post(
    '/v1/admin/push/subscriptions',
    auth.guard('requests'),
    async (c) => {
      if (!cfg.VAPID_PUBLIC_KEY) fail(503, 'PUSH_NOT_CONFIGURED');
      const data = await auth.parse(c, pushSubscriptionSchema),
        userId = c.get('principal').id;
      await db.transaction(async (tx) => {
        await tx
          .select({ id: s.adminUsers.id })
          .from(s.adminUsers)
          .where(eq(s.adminUsers.id, userId))
          .for('update');
        const rows = await tx
          .select({
            id: s.pushSubscriptions.id,
            endpointHash: s.pushSubscriptions.endpointHash,
          })
          .from(s.pushSubscriptions)
          .where(eq(s.pushSubscriptions.userId, userId));
        if (
          rows.length >= 20 &&
          !rows.some((row) => row.endpointHash === hash(data.endpoint))
        )
          fail(429, 'RATE_LIMITED');
        await tx
          .insert(s.pushSubscriptions)
          .values({
            userId,
            endpoint: data.endpoint,
            endpointHash: hash(data.endpoint),
            p256dh: data.keys.p256dh,
            auth: data.keys.auth,
            locale: data.locale,
          })
          .onConflictDoUpdate({
            target: s.pushSubscriptions.endpointHash,
            set: {
              userId,
              p256dh: data.keys.p256dh,
              auth: data.keys.auth,
              locale: data.locale,
              createdAt: new Date(),
            },
          });
      });
      return c.json({ ok: true }, 201);
    },
  );
  app.delete(
    '/v1/admin/push/subscriptions',
    auth.guard('requests'),
    async (c) => {
      const data = await auth.parse(c, z.strictObject({ endpoint }));
      await db
        .delete(s.pushSubscriptions)
        .where(
          and(
            eq(s.pushSubscriptions.userId, c.get('principal').id),
            eq(s.pushSubscriptions.endpointHash, hash(data.endpoint)),
          ),
        );
      return c.json({ ok: true });
    },
  );
}
type Send = typeof webpush.sendNotification;
export async function notifyPush(
  db: Database,
  cfg: WorkerConfig,
  requestId: string,
  send: Send = webpush.sendNotification,
) {
  if (!cfg.VAPID_PUBLIC_KEY || !cfg.VAPID_PRIVATE_KEY || !cfg.VAPID_SUBJECT)
    return;
  const [request] = await db
    .select({ id: s.bookingRequests.id })
    .from(s.bookingRequests)
    .where(
      and(
        eq(s.bookingRequests.id, requestId),
        isNull(s.bookingRequests.anonymizedAt),
        ne(s.bookingRequests.status, 'spam'),
        gt(s.bookingRequests.createdAt, new Date(Date.now() - 90 * 86400000)),
      ),
    );
  if (!request) return;
  const subscriptions = await db
    .select({ subscription: s.pushSubscriptions })
    .from(s.pushSubscriptions)
    .innerJoin(s.adminUsers, eq(s.adminUsers.id, s.pushSubscriptions.userId))
    .where(
      and(
        isNull(s.adminUsers.disabledAt),
        inArray(s.adminUsers.role, ['owner', 'manager', 'sales']),
      ),
    );
  for (const { subscription } of subscriptions) {
    if (!isPushEndpoint(subscription.endpoint)) continue;
    try {
      await send(
        {
          endpoint: subscription.endpoint,
          keys: { auth: subscription.auth, p256dh: subscription.p256dh },
        },
        JSON.stringify({ locale: subscription.locale }),
        {
          TTL: 3600,
          timeout: 10000,
          vapidDetails: {
            subject: cfg.VAPID_SUBJECT,
            publicKey: cfg.VAPID_PUBLIC_KEY,
            privateKey: cfg.VAPID_PRIVATE_KEY,
          },
        },
      );
    } catch (error) {
      const code = Number((error as { statusCode?: number }).statusCode);
      if (code === 404 || code === 410)
        await db
          .delete(s.pushSubscriptions)
          .where(eq(s.pushSubscriptions.id, subscription.id));
      else throw new Error('Push delivery failed');
    }
  }
}
