import { describe, it, expect } from 'vitest';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { connectDatabase } from '@stella/db';
import { migrateDatabase } from '../../../packages/db/src/migration-service';
import { seedCatalog } from '../../../packages/db/src/seed-data';
describe('actual PostgreSQL backup and staging scrub', () => {
  it('restores the catalog/translations while removing customer, staff, session and job data', async () => {
    const container = await new PostgreSqlContainer('postgres:16')
      .withUsername('stella_migrate')
      .withPassword(randomBytes(24).toString('hex'))
      .withDatabase('stella_prod')
      .start();
    const sourceUrl = container.getConnectionUri();
    const source = connectDatabase(sourceUrl);
    let staging: ReturnType<typeof connectDatabase> | undefined;
    try {
      await migrateDatabase(sourceUrl);
      await seedCatalog(source.db, {
        catalogPath: new URL('../../../data/catalog.json', import.meta.url),
        ownerEmail: 'private-owner@example.test',
      });
      await source.pool.query(
        `insert into booking_requests(ref,mode,format,start_date,adults,children,pickup_area,hotel,name,phone,email,notes,locale) values('ST-TEST','single','group',current_date,1,0,'Old Market','Private hotel','Private visitor','+201000000001','private-visitor@example.test','private notes','en')`,
      );
      await source.pool.query(
        `insert into sessions(id,user_id,expires_at) select 'synthetic-session',id,now()+interval '1 hour' from admin_users limit 1`,
      );
      await source.pool.query(
        `insert into auth_tokens(id,user_id,purpose,expires_at) select 'synthetic-token',id,'reset',now()+interval '1 hour' from admin_users limit 1`,
      );
      await source.pool.query(
        `insert into admin_devices(user_id,token_hash,expires_at) select id,'synthetic-device',now()+interval '1 day' from admin_users limit 1`,
      );
      await source.pool.query(
        `insert into outbox(name,data) values('auth.reset','{"email":"private-visitor@example.test"}')`,
      );
      const dump = await container.exec([
        'sh',
        '-c',
        'pg_dump -U stella_migrate -d stella_prod --no-owner --no-acl -Fc > /tmp/verify.dump',
      ]);
      expect(dump.exitCode).toBe(0);
      await source.pool.query('create database stella_staging');
      const restored = await container.exec([
        'pg_restore',
        '-U',
        'stella_migrate',
        '-d',
        'stella_staging',
        '--no-owner',
        '--no-acl',
        '--exit-on-error',
        '/tmp/verify.dump',
      ]);
      expect(restored.exitCode).toBe(0);
      const url = new URL(sourceUrl);
      url.pathname = '/stella_staging';
      staging = connectDatabase(url.href);
      await staging.pool.query(
        await readFile(resolve('infra/backup/scrub-staging.sql'), 'utf8'),
      );
      const { rows } = await staging.pool.query(
        `select (select count(*) from trips)::int as trips, (select count(*) from content_translations)::int as translations, (select count(*) from admin_users)+(select count(*) from booking_requests)+(select count(*) from sessions)+(select count(*) from auth_tokens)+(select count(*) from admin_devices)+(select count(*) from outbox) as private_rows`,
      );
      expect(rows[0].trips).toBe(42);
      expect(rows[0].translations).toBeGreaterThan(1000);
      expect(Number(rows[0].private_rows)).toBe(0);
      expect(
        Number(
          (await source.pool.query('select count(*) from booking_requests'))
            .rows[0].count,
        ),
      ).toBe(1);
    } finally {
      await staging?.pool.end();
      await source.pool.end();
      await container.stop();
    }
  });
});
