import { localDatabase } from '../real-api/setup';
export default async function teardown() {
  const { pool } = await localDatabase('verification');
  try {
    await pool.query(
      "delete from outbox where name in ('notify.request.created','notify.request.push') and data->>'requestId' in (select id::text from booking_requests where name like 'Synthetic integration QA %')",
    );
    await pool.query(
      "delete from booking_requests where name like 'Synthetic integration QA %'",
    );
  } finally {
    await pool.end();
  }
}
