import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
  createCipheriv,
  createDecipheriv,
} from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { hash, verify as verifyPassword } from '@node-rs/argon2';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Context, MiddlewareHandler, Hono } from 'hono';
import { and, eq, gt, isNull, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '@stella/db';
import * as s from '@stella/db/schema';
import {
  can,
  type Permission,
  loginSchema,
  resetRequestSchema,
  passwordTokenSchema,
  reauthSchema,
} from '@stella/shared/admin';
import type { Config } from './config';
import type { ApiEnv, Principal } from './types';
import { consume } from './rate';
import { hashPrivate } from './requests';
import { fail } from './errors';
import { isIP } from 'node:net';
import { rateLimitAddress } from '@stella/shared/ip';
export const sha = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export const opaque = () => randomBytes(32).toString('base64url');
// 2 is Argon2id in the package's const enum (not importable with isolatedModules).
export const passwordHash = (password: string) =>
  hash(password, {
    algorithm: 2,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
    outputLen: 32,
  });
export function seal(value: string, key: string, aad: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'base64'), iv);
  cipher.setAAD(Buffer.from(aad));
  const encrypted = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
}
export function unseal(value: Buffer, key: string, aad: string) {
  const cipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(key, 'base64'),
    value.subarray(0, 12),
  );
  cipher.setAAD(Buffer.from(aad));
  cipher.setAuthTag(value.subarray(12, 28));
  return Buffer.concat([
    cipher.update(value.subarray(28)),
    cipher.final(),
  ]).toString('utf8');
}
/**
 * Purpose-bound AAD and signatures (audit SEC-06). One key never produces a
 * value that another feature would accept. Values sealed before this change
 * used the bare user id as AAD; unsealPurpose still opens those.
 */
export const aad = (purpose: 'auth-token', userId: string) =>
  purpose + ':' + userId;
export function unsealPurpose(
  value: Buffer,
  key: string,
  purpose: 'auth-token',
  userId: string,
): { value: string; legacy: boolean } {
  try {
    return { value: unseal(value, key, aad(purpose, userId)), legacy: false };
  } catch {
    return { value: unseal(value, key, userId), legacy: true };
  }
}
export const signPurpose = (
  purpose: 'preview' | 'bulk-prices',
  encoded: string,
  key: string,
) =>
  createHmac('sha256', key)
    .update(purpose + ':' + encoded)
    .digest('base64url');
export function equal(a: string, b: string) {
  return (
    Buffer.byteLength(a) === Buffer.byteLength(b) &&
    timingSafeEqual(Buffer.from(a), Buffer.from(b))
  );
}
const cookie = '__Host-stella_admin',
  csrfCookie = '__Host-stella_csrf',
  deviceCookie = '__Host-stella_device';
export const sessionHash = (raw: string, key: string) =>
  createHmac('sha256', key)
    .update('session:' + raw)
    .digest('hex');
export const csrfToken = (raw: string, key: string) =>
  createHmac('sha256', key)
    .update('csrf:' + raw)
    .digest('base64url');
/**
 * The caller's address for rate limits and privacy hashes. IPv6 callers are
 * grouped by /64 (see rateLimitAddress), so the result is never a raw address.
 */
export function clientIp(c: Context<ApiEnv>, cfg: Config) {
  const direct =
    c.env?.incoming?.socket.remoteAddress ?? c.env?.remoteAddress ?? 'unknown';
  const forwarded = c.req.header('x-forwarded-for')?.trim();
  const proxies = cfg.TRUSTED_PROXY_IPS.split(',').map((v) => v.trim());
  const fromProxy =
    proxies.includes(direct) || proxies.includes(rateLimitAddress(direct));
  return rateLimitAddress(
    fromProxy && forwarded && isIP(forwarded) ? forwarded : direct,
  );
}
export function authService(db: Database, cfg: Config) {
  type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
  const recognizeDevice = async (
    tx: Transaction,
    c: Context<ApiEnv>,
    userId: string,
  ) => {
    const supplied = getCookie(c, deviceCookie);
    const raw =
      supplied && /^[A-Za-z0-9_-]{43}$/.test(supplied) ? supplied : opaque();
    const tokenHash = sha(raw),
      now = new Date(),
      expiresAt = new Date(Date.now() + 90 * 86400000);
    await tx
      .delete(s.adminDevices)
      .where(
        and(
          eq(s.adminDevices.userId, userId),
          sql`${s.adminDevices.expiresAt} <= now()`,
        ),
      );
    const inserted = await tx
      .insert(s.adminDevices)
      .values({ userId, tokenHash, expiresAt })
      .onConflictDoNothing()
      .returning({ id: s.adminDevices.id });
    if (inserted.length)
      await tx.insert(s.outbox).values({
        name: 'auth.new_device',
        data: { userId, deviceId: inserted[0]!.id },
      });
    else
      await tx
        .update(s.adminDevices)
        .set({ lastSeenAt: now, expiresAt })
        .where(
          and(
            eq(s.adminDevices.userId, userId),
            eq(s.adminDevices.tokenHash, tokenHash),
          ),
        );
    await tx.execute(
      sql`delete from admin_devices where user_id=${userId}::uuid and id in (select id from admin_devices where user_id=${userId}::uuid order by last_seen_at desc,id offset 20)`,
    );
    return raw;
  };
  const rememberDevice = (c: Context<ApiEnv>, raw: string) =>
    setCookie(c, deviceCookie, raw, {
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      path: '/',
      maxAge: 90 * 86400,
    });
  const activeSession = async (tx: Transaction, p: Principal) => {
    const [session] = await tx
      .select()
      .from(s.sessions)
      .where(and(eq(s.sessions.id, p.sessionId), eq(s.sessions.userId, p.id)))
      .for('update');
    if (
      !session ||
      session.expiresAt.getTime() <= Date.now() ||
      Date.now() - session.lastSeenAt.getTime() > 8 * 3600000
    )
      fail(401, 'UNAUTHENTICATED');
    return session;
  };
  const dummy = passwordHash(opaque());
  let breached: Promise<Set<string>> | null = null;
  const checkPassword = async (password: string) => {
    breached ??= readFile(cfg.BREACHED_PASSWORDS_FILE, 'utf8').then((data) => {
      const values = data.split(/\r?\n/).filter(Boolean);
      if (values.length < 100000)
        throw new Error('Password policy data unavailable');
      return new Set(values.map((v) => v.normalize('NFKC').toLowerCase()));
    });
    let list: Set<string>;
    try {
      list = await breached;
    } catch {
      breached = null;
      fail(503, 'PASSWORD_POLICY_UNAVAILABLE');
    }
    if (
      password.length < 12 ||
      list.has(password.normalize('NFKC').toLowerCase())
    )
      fail(422, 'WEAK_PASSWORD');
  };
  const origin = (c: Context<ApiEnv>) => {
    if (c.req.header('origin') !== new URL(cfg.ADMIN_ORIGIN).origin)
      fail(403, 'INVALID_ORIGIN');
  };
  const cookies = (c: Context<ApiEnv>, raw: string, maxAge = 2592000) => {
    setCookie(c, cookie, raw, {
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      path: '/',
      maxAge,
    });
    setCookie(c, csrfCookie, csrfToken(raw, cfg.SESSION_SECRET), {
      secure: true,
      sameSite: 'Strict',
      path: '/',
      maxAge,
    });
  };
  const readPrincipal = async (c: Context<ApiEnv>) => {
    const raw = getCookie(c, cookie);
    if (!raw || !/^[A-Za-z0-9_-]{43}$/.test(raw)) fail(401, 'UNAUTHENTICATED');
    const [row] = await db
      .select({ session: s.sessions, user: s.adminUsers })
      .from(s.sessions)
      .innerJoin(s.adminUsers, eq(s.sessions.userId, s.adminUsers.id))
      .where(eq(s.sessions.id, sessionHash(raw, cfg.SESSION_SECRET)));
    const now = Date.now();
    if (
      !row ||
      row.user.disabledAt ||
      row.session.expiresAt.getTime() <= now ||
      now - row.session.lastSeenAt.getTime() > 8 * 3600000
    )
      fail(401, 'UNAUTHENTICATED');
    const touchBefore = new Date(now - 5 * 60_000);
    if (row.session.lastSeenAt <= touchBefore) {
      const touched = await db
        .update(s.sessions)
        .set({ lastSeenAt: new Date(now) })
        .where(
          and(
            eq(s.sessions.id, row.session.id),
            lte(s.sessions.lastSeenAt, touchBefore),
          ),
        )
        .returning({ id: s.sessions.id });
      if (!touched.length) {
        const [active] = await db
          .select({ id: s.sessions.id })
          .from(s.sessions)
          .where(eq(s.sessions.id, row.session.id));
        if (!active) fail(401, 'UNAUTHENTICATED');
      }
    }
    return {
      raw,
      row,
      principal: {
        id: row.user.id,
        email: row.user.email,
        name: row.user.name,
        role: row.user.role,
        sessionId: row.session.id,
        reauthAt: row.session.reauthAt,
      } satisfies Principal,
    };
  };
  const principals = new WeakMap<
    Context<ApiEnv>,
    ReturnType<typeof readPrincipal>
  >();
  const guard =
    (permission?: Permission): MiddlewareHandler<ApiEnv> =>
    async (c, next) => {
      if (
        c.req.header('origin') &&
        c.req.header('origin') !== new URL(cfg.ADMIN_ORIGIN).origin
      )
        fail(403, 'INVALID_ORIGIN');
      const pending = principals.get(c) ?? readPrincipal(c);
      principals.set(c, pending);
      const { raw, principal } = await pending;
      c.set('principal', principal);
      if (permission && !can(principal.role, permission))
        fail(403, 'FORBIDDEN');
      if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
        origin(c);
        const header = c.req.header('x-csrf-token') ?? '',
          value = getCookie(c, csrfCookie) ?? '';
        if (
          !header ||
          !equal(header, value) ||
          !equal(header, csrfToken(raw, cfg.SESSION_SECRET))
        )
          fail(403, 'INVALID_CSRF');
      }
      await next();
    };
  const recent = (c: Context<ApiEnv>) => {
    const p = c.get('principal');
    if (!p.reauthAt || Date.now() - p.reauthAt.getTime() > 5 * 60000)
      fail(403, 'REAUTH_REQUIRED');
  };
  const parse = async <S extends z.ZodType>(
    c: Context<ApiEnv>,
    schema: S,
  ): Promise<z.output<S>> => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      fail(400, 'INVALID_JSON');
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) fail(422, 'INVALID_INPUT');
    return parsed.data;
  };
  function register(app: Hono<ApiEnv>) {
    app.post('/v1/admin/auth/login', async (c) => {
      origin(c);
      const b = await parse(c, loginSchema),
        ipHash = hashPrivate(clientIp(c, cfg), cfg.IP_HASH_SALT),
        accountHash = hashPrivate(b.email.toLowerCase(), cfg.IP_HASH_SALT);
      if (
        // Local development only (config.ts refuses the flag elsewhere).
        cfg.DEV_SIMPLE_ADMIN_LOGIN !== 'true' &&
        (!(await consume(db, 'login-ip:' + ipHash, 20, 900)) ||
          !(await consume(db, 'login-account:' + accountHash, 5, 900)))
      )
        fail(429, 'RATE_LIMITED');
      const user = (
        await db
          .select()
          .from(s.adminUsers)
          .where(eq(s.adminUsers.email, b.email))
      )[0];
      const stored = user?.passwordHash.startsWith('$argon2id$')
        ? user.passwordHash
        : await dummy;
      const valid = await verifyPassword(stored, b.password).catch(() => false);
      if (
        !user ||
        !valid ||
        user.disabledAt ||
        (user.lockedUntil && user.lockedUntil > new Date())
      ) {
        // No lockout on a developer machine (DEV_SIMPLE_ADMIN_LOGIN).
        if (user && cfg.DEV_SIMPLE_ADMIN_LOGIN !== 'true')
          await db
            .update(s.adminUsers)
            .set({
              failedLogins: sql`${s.adminUsers.failedLogins}+1`,
              lockedUntil: sql`case when ${s.adminUsers.failedLogins}>=4 then now()+least(3600,power(2,least(${s.adminUsers.failedLogins}-4,10))::int*60)*interval '1 second' else ${s.adminUsers.lockedUntil} end`,
            })
            .where(eq(s.adminUsers.id, user.id));
        fail(401, 'INVALID_CREDENTIALS');
      }
      const raw = opaque();
      const recognized = await db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(s.adminUsers)
          .where(eq(s.adminUsers.id, user.id))
          .for('update');
        if (
          !current ||
          current.disabledAt ||
          current.passwordHash !== user.passwordHash ||
          current.role !== user.role ||
          (current.lockedUntil && current.lockedUntil > new Date())
        )
          fail(401, 'INVALID_CREDENTIALS');
        await tx.insert(s.sessions).values({
          id: sessionHash(raw, cfg.SESSION_SECRET),
          userId: user.id,
          expiresAt: new Date(Date.now() + 2592000000),
          ipHash,
          userAgent: (c.req.header('user-agent') ?? '').slice(0, 300),
        });
        await tx
          .update(s.adminUsers)
          .set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() })
          .where(eq(s.adminUsers.id, user.id));
        return recognizeDevice(tx, c, user.id);
      });
      cookies(c, raw);
      rememberDevice(c, recognized);
      return c.json({ csrf_token: csrfToken(raw, cfg.SESSION_SECRET) }, 200);
    });
    app.post('/v1/admin/auth/reauth', guard(), async (c) => {
      const b = await parse(c, reauthSchema),
        p = c.get('principal');
      if (!(await consume(db, 'reauth:' + p.id, 5, 900)))
        fail(429, 'RATE_LIMITED');
      await db.transaction(async (tx) => {
        const [user] = await tx
          .select()
          .from(s.adminUsers)
          .where(eq(s.adminUsers.id, p.id))
          .for('update');
        await activeSession(tx, p);
        if (!user || user.disabledAt) fail(401, 'UNAUTHENTICATED');
        if (!(await verifyPassword(user!.passwordHash, b.password)))
          fail(401, 'INVALID_CREDENTIALS');
        await tx
          .update(s.sessions)
          .set({ reauthAt: new Date() })
          .where(eq(s.sessions.id, p.sessionId));
      });
      return c.json({ ok: true });
    });
    app.post('/v1/admin/auth/logout', guard(), async (c) => {
      await db
        .delete(s.sessions)
        .where(eq(s.sessions.id, c.get('principal').sessionId));
      deleteCookie(c, cookie, { path: '/', secure: true });
      deleteCookie(c, csrfCookie, { path: '/', secure: true });
      return c.json({ ok: true });
    });
    app.post('/v1/admin/auth/logout-all', guard(), async (c) => {
      const p = c.get('principal');
      await db.transaction(async (tx) => {
        await tx
          .select({ id: s.adminUsers.id })
          .from(s.adminUsers)
          .where(eq(s.adminUsers.id, p.id))
          .for('update');
        await activeSession(tx, p);
        await tx.delete(s.sessions).where(eq(s.sessions.userId, p.id));
        await tx.delete(s.adminDevices).where(eq(s.adminDevices.userId, p.id));
        await tx
          .delete(s.pushSubscriptions)
          .where(eq(s.pushSubscriptions.userId, p.id));
        await tx.insert(s.auditLog).values({
          userId: p.id,
          action: 'logout_all',
          entity: 'user',
          entityId: p.id,
        });
      });
      for (const name of [cookie, csrfCookie, deviceCookie])
        deleteCookie(c, name, { path: '/', secure: true });
      return c.json({ ok: true });
    });
    app.post('/v1/admin/auth/password/change', guard(), async (c) => {
      recent(c);
      const b = await parse(
        c,
        z.strictObject({ password: z.string().min(12).max(256) }),
      );
      await checkPassword(b.password);
      const encoded = await passwordHash(b.password),
        p = c.get('principal');
      await db.transaction(async (tx) => {
        const [user] = await tx
          .select({ id: s.adminUsers.id })
          .from(s.adminUsers)
          .where(eq(s.adminUsers.id, p.id))
          .for('update');
        if (!user) fail(401, 'UNAUTHENTICATED');
        await activeSession(tx, p);
        await tx
          .update(s.adminUsers)
          .set({ passwordHash: encoded, failedLogins: 0, lockedUntil: null })
          .where(eq(s.adminUsers.id, p.id));
        await tx.delete(s.sessions).where(eq(s.sessions.userId, p.id));
        await tx.delete(s.authTokens).where(eq(s.authTokens.userId, p.id));
        await tx.insert(s.auditLog).values({
          userId: p.id,
          entity: 'user',
          entityId: p.id,
          action: 'password_change',
        });
      });
      for (const name of [cookie, csrfCookie])
        deleteCookie(c, name, { path: '/', secure: true });
      return c.json({ ok: true });
    });
    app.post('/v1/admin/auth/password/reset-request', async (c) => {
      origin(c);
      const b = await parse(c, resetRequestSchema);
      if (
        !(await consume(
          db,
          'reset:' + hashPrivate(clientIp(c, cfg), cfg.IP_HASH_SALT),
          5,
          900,
        ))
      )
        fail(429, 'RATE_LIMITED');
      const [user] = await db
        .select()
        .from(s.adminUsers)
        .where(
          and(eq(s.adminUsers.email, b.email), isNull(s.adminUsers.disabledAt)),
        );
      if (user) {
        const raw = opaque();
        await db.transaction(async (tx) => {
          await tx
            .delete(s.authTokens)
            .where(
              and(
                eq(s.authTokens.userId, user.id),
                eq(s.authTokens.purpose, 'reset'),
              ),
            );
          await tx.insert(s.authTokens).values({
            id: sha(raw),
            userId: user.id,
            purpose: 'reset',
            expiresAt: new Date(Date.now() + 1800000),
          });
          await tx.insert(s.outbox).values({
            name: 'auth.reset',
            data: {
              userId: user.id,
              token: seal(
                raw,
                cfg.TOTP_ENC_KEY,
                aad('auth-token', user.id),
              ).toString('base64'),
            },
          });
        });
      }
      return c.json({ ok: true }, 202);
    });
    for (const purpose of ['setup', 'reset'] as const)
      app.post('/v1/admin/auth/password/' + purpose, async (c) => {
        origin(c);
        const b = await parse(c, passwordTokenSchema);
        if (
          !(await consume(
            db,
            'token:' + hashPrivate(clientIp(c, cfg), cfg.IP_HASH_SALT),
            10,
            900,
          ))
        )
          fail(429, 'RATE_LIMITED');
        await checkPassword(b.password);
        const encoded = await passwordHash(b.password);
        await db.transaction(async (tx) => {
          const [token] = await tx
            .delete(s.authTokens)
            .where(
              and(
                eq(s.authTokens.id, sha(b.token)),
                eq(s.authTokens.purpose, purpose),
                gt(s.authTokens.expiresAt, new Date()),
              ),
            )
            .returning();
          if (!token) fail(401, 'INVALID_TOKEN');
          const [user] = await tx
            .select()
            .from(s.adminUsers)
            .where(eq(s.adminUsers.id, token.userId))
            .for('update');
          if (!user || user.disabledAt) fail(401, 'INVALID_TOKEN');
          await tx
            .update(s.adminUsers)
            .set({ passwordHash: encoded, failedLogins: 0, lockedUntil: null })
            .where(eq(s.adminUsers.id, user.id));
          await tx.delete(s.sessions).where(eq(s.sessions.userId, user.id));
          await tx.delete(s.authTokens).where(eq(s.authTokens.userId, user.id));
        });
        return c.json({ ok: true });
      });
    app.get('/v1/admin/me', guard(), async (c) => {
      const p = c.get('principal');
      return c.json({
        id: p.id,
        email: p.email,
        name: p.name,
        role: p.role,
        csrf_token: csrfToken(getCookie(c, cookie)!, cfg.SESSION_SECRET),
      });
    });
    app.get('/v1/admin/me/sessions', guard(), async (c) =>
      c.json(
        await db
          .select({
            id: s.sessions.id,
            created_at: s.sessions.createdAt,
            last_seen_at: s.sessions.lastSeenAt,
            expires_at: s.sessions.expiresAt,
            user_agent: s.sessions.userAgent,
            current: sql<boolean>`${s.sessions.id} = ${c.get('principal').sessionId}`,
          })
          .from(s.sessions)
          .where(eq(s.sessions.userId, c.get('principal').id)),
      ),
    );
    app.delete('/v1/admin/me/sessions/:id', guard(), async (c) => {
      const id = c.req.param('id');
      if (!/^[a-f0-9]{64}$/.test(id)) fail(422, 'INVALID_ID');
      await db
        .delete(s.sessions)
        .where(
          and(
            eq(s.sessions.id, id),
            eq(s.sessions.userId, c.get('principal').id),
          ),
        );
      return c.json({ ok: true });
    });
  }
  return { guard, recent, parse, register };
}
