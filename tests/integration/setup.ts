import { localDatabase } from '../real-api/setup';
export default async function setup() {
  if (process.env.STELLA_INTEGRATION_VERIFY !== '1')
    throw new Error('Explicit local verification flag required');
  const { pool } = await localDatabase('verification');
  try {
    const {
      rows: [role],
    } = await pool.query(
      "select rolsuper,rolcreatedb,rolcreaterole,has_schema_privilege(current_user,'public','CREATE') as can_create from pg_roles where rolname=current_user",
    );
    if (
      role.rolsuper ||
      role.rolcreatedb ||
      role.rolcreaterole ||
      role.can_create
    )
      throw new Error('Verification runtime role is too privileged');
    await pool.query(
      "delete from booking_requests where name like 'Synthetic integration QA %'",
    );
    await pool.query('delete from rate_buckets');
  } finally {
    await pool.end();
  }
}
