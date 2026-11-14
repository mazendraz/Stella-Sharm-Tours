import { localDatabase } from './setup';
export default async function teardown() {
  const { pool } = await localDatabase();
  try {
    const names = ['mobile', 'tablet', 'desktop'].map(
        (view) => 'Synthetic browser QA ' + view,
      ),
      phones = ['+201055500001', '+201055500002', '+201055500003'];
    const removed = await pool.query(
      'delete from booking_requests where name=any($1::text[]) and phone=any($2::text[]) returning id',
      [names, phones],
    );
    if (removed.rows.length)
      await pool.query(
        "delete from outbox where name='notify.request.created' and data->>'requestId'=any($1::text[])",
        [removed.rows.map((row) => row.id)],
      );
    console.log(
      'Removed ' +
        removed.rowCount +
        ' synthetic local browser bookings; seeded content is unchanged.',
    );
  } finally {
    await pool.end();
  }
}
