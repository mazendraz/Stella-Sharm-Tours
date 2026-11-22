import { assertRestrictedRuntime, localDatabase } from '../real-api/setup';
export default async function setup() {
  if (process.env.STELLA_INTEGRATION_VERIFY !== '1')
    throw new Error('Explicit local verification flag required');
  await assertRestrictedRuntime('verification');
  const { pool } = await localDatabase('verification');
  try {
    await pool.query(
      "delete from booking_requests where name like 'Synthetic integration QA %'",
    );
    await pool.query('delete from rate_buckets');
  } finally {
    await pool.end();
  }
}
