import type { Pool } from 'pg';

// The migration credential owns DDL. Every entry here is a runtime capability.
const apiGrants = [
  'SELECT, INSERT, UPDATE ON admin_users, collections, faqs, hero_slides, media, settings, trips',
  'SELECT, INSERT, UPDATE, DELETE ON admin_devices, booking_requests, content_drafts, content_translations, page_blocks, push_subscriptions, rate_buckets, sessions, trip_itinerary, trip_items, trip_prices',
  'SELECT, INSERT, DELETE ON auth_tokens, package_items, trip_media',
  'SELECT, INSERT ON audit_log, booking_request_items, booking_request_receipts, revisions',
  'SELECT ON public_media_renditions, translation_usage',
  'INSERT ON outbox',
] as const;
const workerGrants = [
  'SELECT ON collections, content_translations, faqs, hero_slides, media, package_items, page_blocks, settings, trip_itinerary, trip_items, trip_media, trip_prices, trips',
  'SELECT (id, email, role, disabled_at) ON admin_users',
  'SELECT (id, user_id, created_at, expires_at) ON admin_devices',
  'SELECT (id, created_at, status, anonymized_at) ON booking_requests',
  'SELECT (request_id, trip_id, day_index) ON booking_request_items',
  'SELECT ON worker_price_audit, worker_revision_media_keys',
  'SELECT, DELETE ON push_subscriptions',
  'SELECT, INSERT, UPDATE ON translation_usage',
  'INSERT ON public_media_renditions',
  'UPDATE (width, height, duration_s, variants, status) ON media',
  'SELECT, INSERT, UPDATE (delivered_at) ON outbox',
] as const;

const quote = (identifier: string) =>
  '"' + identifier.replaceAll('"', '""') + '"';

export async function applyRuntimePrivileges(
  pool: Pool,
  roles = { api: 'stella_api', worker: 'stella_worker' },
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const kind of ['api', 'worker'] as const) {
      const role = roles[kind];
      const exists = await client.query(
        'SELECT 1 FROM pg_roles WHERE rolname=$1',
        [role],
      );
      if (!exists.rows.length) continue;
      const principal = quote(role);

      // Table-level revocation does not clear direct column ACLs on upgrades.
      const columns = await client.query<{
        table_name: string;
        column_name: string;
      }>(
        `SELECT DISTINCT c.relname AS table_name, a.attname AS column_name
         FROM pg_attribute AS a
         JOIN pg_class AS c ON c.oid = a.attrelid
         JOIN pg_namespace AS n ON n.oid = c.relnamespace
         CROSS JOIN LATERAL aclexplode(a.attacl) AS acl
         JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
         WHERE n.nspname='public' AND NOT a.attisdropped AND grantee.rolname=$1`,
        [role],
      );
      for (const { table_name: table, column_name: column } of columns.rows)
        await client.query(
          `REVOKE ALL (${quote(column)}) ON public.${quote(table)} FROM ${principal}`,
        );

      for (const schema of ['public', 'pgboss']) {
        await client.query(`REVOKE ALL ON SCHEMA ${schema} FROM ${principal}`);
        for (const object of ['TABLES', 'SEQUENCES', 'FUNCTIONS']) {
          await client.query(
            `REVOKE ALL ON ALL ${object} IN SCHEMA ${schema} FROM ${principal}`,
          );
          await client.query(
            `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} REVOKE ALL ON ${object} FROM ${principal}`,
          );
        }
      }
      await client.query(`GRANT USAGE ON SCHEMA public TO ${principal}`);
      const grants = kind === 'api' ? apiGrants : workerGrants;
      for (const grant of grants) {
        const [actions, relations] = grant.split(' ON ') as [string, string];
        const tables = relations
          .split(', ')
          .map((table) => 'public.' + quote(table));
        await client.query(
          `GRANT ${actions} ON ${tables.join(', ')} TO ${principal}`,
        );
      }
      if (kind === 'api') {
        await client.query(
          `GRANT USAGE ON SEQUENCE public.audit_log_id_seq, public.revisions_id_seq TO ${principal}`,
        );
        await client.query(
          `GRANT EXECUTE ON FUNCTION public.scrub_request_history(uuid[]) TO ${principal}`,
        );
      } else {
        await client.query(`GRANT EXECUTE ON FUNCTION public.worker_cleanup_expired(), public.worker_purge_expired_requests(),
          public.worker_request_notification(uuid), public.worker_set_translation_status(text,jsonb),
          public.worker_save_machine_translation(text,text,text,text,text,text,text) TO ${principal}`);
        // pg-boss owns its storage layout and can add job partitions on upgrade.
        await client.query(`GRANT USAGE ON SCHEMA pgboss TO ${principal}`);
        await client.query(
          `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pgboss TO ${principal}`,
        );
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
