import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { notificationLabels } from '../src/lib/notification-content.ts';

test('engagement upgrades preserve existing document notifications and repair already-upgraded databases', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create table notifications(kind text not null);
      insert into notifications values ('document_request'),('document_received');`);
    const engagement = await readFile(new URL('../supabase/migrations/20260928142018_engagement_notifications_batch.sql', import.meta.url), 'utf8');
    // Exercise the actual constraint update against an already-populated outbox.
    await db.exec(engagement.slice(0, engagement.indexOf('create or replace function')));
    assert.equal((await db.query('select count(*)::int as n from notifications')).rows[0].n, 2);

    // Simulate the previously shipped restrictive constraint on an empty outbox.
    await db.exec(`delete from notifications;
      alter table notifications drop constraint notifications_kind_check;
      alter table notifications add constraint notifications_kind_check check(kind='engagement_sent');`);
    const repair = await readFile(new URL('../supabase/migrations/20260928150000_restore_document_notification_kinds.sql', import.meta.url), 'utf8');
    await db.exec(repair);
    for (const kind of Object.keys(notificationLabels)) {
      await db.query('insert into notifications(kind) values ($1)', [kind]);
    }
    await assert.rejects(db.query('insert into notifications(kind) values ($1)', ['unknown_event']), /notifications_kind_check/);
    await db.exec(repair);
    assert.equal((await db.query('select count(*)::int as n from notifications')).rows[0].n, Object.keys(notificationLabels).length);
  } finally { await db.close(); }
});
