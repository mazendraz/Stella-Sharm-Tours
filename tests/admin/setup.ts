import { createHmac } from 'node:crypto';
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
      const keys = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].flatMap((ip) =>
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
  } finally {
    await pool.end();
  }
}
