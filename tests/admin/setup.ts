import { createHmac } from 'node:crypto';
import { rateLimitAddress } from '../../packages/shared/src/ip';
import { localDatabase } from '../real-api/setup';
export default async function setup() {
  const verification = process.env.STELLA_INTEGRATION_VERIFY === '1',
    { pool, env } = await localDatabase(
      verification ? 'verification' : 'development',
    );
  try {
    if (verification) {
      // Disposable QA only. Repeated suites share Docker's loopback gateway IP.
      await pool.query(
        "delete from rate_buckets where key like 'login-ip:%' or key like 'reset:%' or key like 'token:%'",
      );
    } else {
      const keys = [
        '127.0.0.1',
        '::1',
        '::ffff:127.0.0.1',
        rateLimitAddress('::1'),
      ].flatMap((ip) =>
        ['login-ip:', 'reset:', 'token:'].map(
          (prefix) =>
            prefix +
            createHmac('sha256', env.IP_HASH_SALT!).update(ip).digest('hex'),
        ),
      );
      await pool.query('delete from rate_buckets where key=any($1::text[])', [
        keys,
      ]);
    }
    // QA specs create throwaway staff (<uuid>@example.test). If a run crashed
    // before its cleanup, never leave those accounts behind in this database.
    const stale = `select id from admin_users where email ~ '^[0-9a-f-]{36}@example[.]test$'`;
    await pool.query(
      `update booking_requests set assigned_to=null where assigned_to in (${stale})`,
    );
    for (const sql of [
      `delete from sessions where user_id in (${stale})`,
      `delete from audit_log where user_id in (${stale})`,
      `delete from revisions where created_by in (${stale})`,
      `delete from push_subscriptions where user_id in (${stale})`,
      `delete from content_pages where slug like 'qa-guide-%'`,
      `delete from visibility_measurements where created_by in (${stale})`,
      `delete from verification_facts where updated_by in (${stale})`,
      `delete from admin_users where id in (${stale})`,
    ])
      await pool.query(sql);
  } finally {
    await pool.end();
  }
}
