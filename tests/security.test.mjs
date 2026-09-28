import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('database authorization and organizer lifecycle', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage;
      create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb, raw_app_meta_data jsonb, invited_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth, storage to authenticated, anon;
      create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
      alter table storage.objects enable row level security;
      grant select, insert on storage.objects to authenticated;
      create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1, '/') $$;
    `);
    const files = (await readdir(new URL('../supabase/migrations/', import.meta.url))).filter(f => f.endsWith('.sql')).sort();
    assert.equal(new Set(files.map(f => f.split('_')[0])).size, files.length, 'Migration versions must be unique');
    for (const file of files) {
      const sql = (await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8')).replace('create extension if not exists "pgcrypto";', '');
      await db.exec(sql);
    }
    // Seed pre-existing accounts independently of the provisioning trigger.
    await db.exec(`
      alter table auth.users disable trigger on_auth_user_created;
      insert into firms(id,name) values ('${id(1)}','A'),('${id(2)}','B');
      insert into auth.users(id,email) values
        ('${id(10)}','staff@a.test'),
        ('${id(11)}','client@a.test'),
        ('${id(12)}','client@b.test'),
        ('${id(14)}','reviewer@a.test');
      insert into profiles(id,firm_id,role,full_name,email,staff_role) values
        ('${id(10)}','${id(1)}','firm_staff','Staff','staff@a.test','manager'),
        ('${id(11)}','${id(1)}','client','Client A','client@a.test',null),
        ('${id(12)}','${id(2)}','client','Client B','client@b.test',null),
        ('${id(14)}','${id(1)}','firm_staff','Reviewer','reviewer@a.test','reviewer');
      insert into clients(id,firm_id,profile_id,primary_contact_name,email,created_by) values
        ('${id(20)}','${id(1)}','${id(11)}','A','client@a.test','${id(10)}'),
        ('${id(21)}','${id(2)}','${id(12)}','B','client@b.test','${id(12)}');
      insert into organizers(id,firm_id,client_id,tax_year,title,status,created_by) values
        ('${id(30)}','${id(1)}','${id(20)}',2025,'Tax','sent','${id(10)}');
      insert into organizer_items(id,organizer_id,prompt,response_type) values
        ('${id(40)}','${id(30)}','Name','text'),
        ('${id(41)}','${id(30)}','File','file'),
        ('${id(42)}','${id(30)}','Yes/no','boolean');
      alter table auth.users enable trigger on_auth_user_created;
    `);
    async function asUser(user, sql, role = 'authenticated') {
      await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${user ?? ''}', false)`);
      try { return await db.query(sql); } finally { await db.exec('reset role'); }
    }
    const denied = (user, sql, pattern, role) => assert.rejects(asUser(user, sql, role), pattern);
    await denied(null, `select * from clients`, /permission denied/, 'anon');
    await denied(null, `select * from documents`, /permission denied/, 'anon');
    await denied(id(11), `update profiles set role='firm_admin' where id='${id(11)}'`, /permission denied|display name can be updated directly/);
    await asUser(id(11), `update profiles set full_name='Updated' where id='${id(11)}'`);
    await denied(id(10), `select admin_update_staff('${id(10)}','firm_admin',true)`, /permission denied|Only an active firm administrator/);
    await denied(id(10), `select save_organizer_response('${id(40)}','"x"')`, /Not authorized/);
    await denied(id(12), `select submit_organizer('${id(30)}')`, /Not authorized/);
    await denied(null, `select submit_organizer('${id(30)}')`, /permission denied/, 'anon');
    await denied(id(11), `insert into organizer_responses(organizer_item_id,value) values ('${id(40)}','"x"')`, /permission denied/);
    await denied(id(11), `select save_organizer_response('${id(40)}','123')`, /Invalid answer/);
    await asUser(id(11), `select save_organizer_response('${id(40)}','"   "')`);
    await denied(id(11), `select submit_organizer('${id(30)}')`, /required item/);
    await asUser(id(11), `select save_organizer_response('${id(40)}','"Answer"')`);
    await asUser(id(11), `select save_organizer_response('${id(42)}','false')`);
    await denied(id(11), `select submit_organizer('${id(30)}')`, /required item/);
    await denied(id(10), `insert into organizers(firm_id,client_id,tax_year,title,created_by) values ('${id(1)}','${id(21)}',2025,'Bad','${id(10)}')`, /foreign key/);
    const path = `${id(1)}/${id(20)}/test.pdf`;
    await denied(id(11), `insert into storage.objects(bucket_id,name) values ('client-documents','${id(2)}/${id(20)}/bad.pdf')`, /row-level security/);
    await asUser(id(11), `insert into storage.objects(bucket_id,name) values ('client-documents','${path}')`);
    await asUser(id(11), `insert into documents(firm_id,client_id,organizer_id,organizer_item_id,uploaded_by,storage_path,file_name) values ('${id(1)}','${id(20)}','${id(30)}','${id(41)}','${id(11)}','${path}','test.pdf')`);

    const generalPath = `${id(1)}/${id(20)}/general/general.pdf`;
    await asUser(id(11), `insert into storage.objects(bucket_id,name) values ('client-documents','${generalPath}')`);
    await asUser(id(11), `
      insert into documents(
        id,firm_id,client_id,uploaded_by,storage_path,file_name,mime_type,size_bytes,document_kind
      ) values (
        '${id(61)}','${id(1)}','${id(20)}','${id(11)}',
        '${generalPath}','general.pdf','application/pdf',500,'source'
      )
    `);
    const generalDocument = (await asUser(
      id(11),
      `select id,client_visible,organizer_id from documents where id='${id(61)}'`
    )).rows[0];
    assert.equal(generalDocument.client_visible, true);
    assert.equal(generalDocument.organizer_id, null);
    assert.equal(
      (await asUser(id(12), `select id from documents where id='${id(61)}'`)).rows.length,
      0
    );
    assert.equal(
      (await asUser(id(12), `select name from storage.objects where name='${generalPath}'`)).rows.length,
      0
    );

    const staffUploadPath = `${id(1)}/${id(20)}/staff-uploads/private-source.pdf`;
    await asUser(id(10), `insert into storage.objects(bucket_id,name) values ('client-documents','${staffUploadPath}')`);
    await asUser(id(10), `
      insert into documents(
        id,firm_id,client_id,uploaded_by,storage_path,file_name,mime_type,size_bytes,document_kind
      ) values (
        '${id(62)}','${id(1)}','${id(20)}','${id(10)}',
        '${staffUploadPath}','private-source.pdf','application/pdf',750,'source'
      )
    `);
    assert.equal(
      (await asUser(id(10), `select id,client_visible from documents where id='${id(62)}'`)).rows[0].client_visible,
      false
    );
    assert.equal(
      (await asUser(id(11), `select id from documents where id='${id(62)}'`)).rows.length,
      0
    );
    assert.equal(
      (await asUser(id(11), `select name from storage.objects where name='${staffUploadPath}'`)).rows.length,
      0
    );

    await asUser(id(11), `select submit_organizer('${id(30)}')`);
    await denied(id(11), `select save_organizer_response('${id(40)}','"Changed"')`, /no longer accepting/);
    await denied(id(11), `select submit_organizer('${id(30)}')`, /submittable state/);
    await denied(id(11), `insert into documents(firm_id,client_id,organizer_id,organizer_item_id,uploaded_by,storage_path,file_name) values ('${id(1)}','${id(20)}','${id(30)}','${id(41)}','${id(11)}','${path}','late.pdf')`, /no longer accepting/);
    assert.equal((await asUser(id(12), `select * from organizers`)).rows.length, 0);
    await assert.rejects(db.exec(`insert into auth.users(id,email,raw_user_meta_data) values ('${id(99)}','evil@test', '{"firm_id":"${id(1)}","role":"firm_admin"}')`), /authorized invitation|valid invitation/);
    await db.exec(`insert into clients(id,firm_id,primary_contact_name,email,created_by) values ('${id(22)}','${id(1)}','Invited','invited@a.test','${id(10)}')`);
    // Supabase Auth can insert the auth.users row before invite metadata is attached.
    // Provision from the server-controlled client record by email, not raw user metadata.
    await db.exec(`insert into auth.users(id,email) values ('${id(13)}','invited@a.test')`);
    assert.equal((await db.query(`select profile_id from clients where id='${id(22)}'`)).rows[0].profile_id, id(13));
    assert.equal((await asUser(id(11), `select * from profiles where id='${id(13)}'`)).rows.length, 0);
    assert.equal((await asUser(id(11), `select * from profiles where id='${id(10)}'`)).rows.length, 1);

    await denied(
      id(11),
      `select set_client_archived('${id(20)}',true)`,
      /Not authorized/
    );
    await denied(
      id(10),
      `select set_client_archived('${id(21)}',true)`,
      /Client not found/
    );
    const archivedClient = (await asUser(
      id(10),
      `select (set_client_archived('${id(20)}',true)).status as status`
    )).rows[0];
    assert.equal(archivedClient.status,'archived');
    assert.equal(
      (await db.query(`select is_active from profiles where id='${id(11)}'`)).rows[0].is_active,
      false
    );
    await denied(
      id(10),
      `insert into tax_return_jobs(
        firm_id,client_id,tax_year,return_type,created_by
      ) values (
        '${id(1)}','${id(20)}',2026,'1040','${id(10)}'
      )`,
      /Archived clients cannot receive new tax-return work/
    );
    await denied(
      id(10),
      `select post_client_message(
        '${id(20)}',
        'Should not send while archived',
        '${id(405)}'
      )`,
      /Archived clients cannot receive new messages/
    );
    const reactivatedClient = (await asUser(
      id(10),
      `select (set_client_archived('${id(20)}',false)).status as status`
    )).rows[0];
    assert.equal(reactivatedClient.status,'active');
    assert.equal(
      (await db.query(`select is_active from profiles where id='${id(11)}'`)).rows[0].is_active,
      true
    );

    await db.exec(`update profiles set is_active=false where id='${id(10)}'`);
    assert.equal((await asUser(id(10), `select * from profiles where id='${id(11)}'`)).rows.length, 0);
    assert.equal((await asUser(id(10), `select * from profiles where id='${id(10)}'`)).rows.length, 1);
    await db.exec(`update profiles set is_active=true where id='${id(10)}'`);
    assert.ok((await asUser(id(10), `select id from audit_log`)).rows.length >= 0);
    assert.equal((await asUser(id(11), `select id from audit_log`)).rows.length, 0);

    await asUser(id(10), `
      insert into client_notes(id,firm_id,client_id,author_id,body)
      values ('${id(63)}','${id(1)}','${id(20)}','${id(10)}','Manager handoff note')
    `);
    assert.equal(
      (await asUser(id(14), `select body from client_notes where id='${id(63)}'`)).rows[0].body,
      'Manager handoff note'
    );
    assert.equal(
      (await asUser(id(11), `select id from client_notes where id='${id(63)}'`)).rows.length,
      0
    );
    assert.equal(
      (await asUser(id(12), `select id from client_notes where id='${id(63)}'`)).rows.length,
      0
    );
    await denied(
      id(11),
      `insert into client_notes(firm_id,client_id,author_id,body) values ('${id(1)}','${id(20)}','${id(11)}','Client should not write internal notes')`,
      /row-level security|permission denied/
    );
    await asUser(
      id(10),
      `update client_notes set is_pinned=true where id='${id(63)}'`
    );
    assert.equal(
      (await db.query(`select is_pinned from client_notes where id='${id(63)}'`)).rows[0].is_pinned,
      true
    );

    const assignedTag = (await asUser(
      id(10),
      `select (assign_client_tag('${id(20)}','Extension')).id as id`
    )).rows[0].id;
    assert.ok(assignedTag);
    assert.equal(
      (await asUser(
        id(10),
        `select count(*)::int as n from client_tag_assignments
         where client_id='${id(20)}' and tag_id='${assignedTag}'`
      )).rows[0].n,
      1
    );
    assert.equal(
      (await asUser(id(11), `select id from client_tags`)).rows.length,
      0
    );
    assert.equal(
      (await asUser(id(11), `select tag_id from client_tag_assignments`)).rows.length,
      0
    );
    await denied(
      id(11),
      `select assign_client_tag('${id(20)}','Client tag')`,
      /Not authorized/
    );
    await denied(
      id(14),
      `select assign_client_tag('${id(20)}','Reviewer tag')`,
      /Not authorized/
    );
    await denied(
      id(10),
      `select assign_client_tag('${id(21)}','Cross firm')`,
      /Client not found/
    );
    await asUser(
      id(10),
      `select remove_client_tag('${id(20)}','${assignedTag}')`
    );
    assert.equal(
      (await db.query(
        `select count(*)::int as n from client_tag_assignments
         where client_id='${id(20)}' and tag_id='${assignedTag}'`
      )).rows[0].n,
      0
    );

    await asUser(id(10), `
      insert into staff_tasks(
        id,firm_id,client_id,title,priority,due_date,assigned_to,created_by
      ) values (
        '${id(64)}','${id(1)}','${id(20)}','Review client follow-up',
        'high','2026-10-01','${id(14)}','${id(10)}'
      )
    `);
    assert.equal(
      (await asUser(id(14), `select title from staff_tasks where id='${id(64)}'`)).rows[0].title,
      'Review client follow-up'
    );
    assert.equal(
      (await asUser(id(11), `select id from staff_tasks where id='${id(64)}'`)).rows.length,
      0
    );
    assert.equal(
      (await asUser(id(12), `select id from staff_tasks where id='${id(64)}'`)).rows.length,
      0
    );
    await denied(
      id(11),
      `insert into staff_tasks(firm_id,client_id,title,created_by) values ('${id(1)}','${id(20)}','Client task','${id(11)}')`,
      /row-level security|permission denied|Creator must be active staff/
    );
    await denied(
      id(10),
      `update staff_tasks set client_id='${id(21)}' where id='${id(64)}'`,
      /same firm|Client must belong/
    );
    await asUser(id(14), `update staff_tasks set status='done' where id='${id(64)}'`);
    const completedTask = (await db.query(
      `select status,completed_at from staff_tasks where id='${id(64)}'`
    )).rows[0];
    assert.equal(completedTask.status,'done');
    assert.ok(completedTask.completed_at);

    const documentId = (await db.query('select id from documents limit 1')).rows[0].id;
    await db.query("insert into document_extractions(document_id,status,fields) values ($1,'completed','{}')", [documentId]);
    await denied(id(10), "update document_extractions set fields='{}'", /permission denied/);
    await denied(id(10), "update document_extractions set status='failed'", /permission denied/);
    await asUser(id(10), `update document_extractions set reviewed_by='${id(10)}',reviewed_at=now()`);
    assert.equal((await asUser(id(11), 'select * from document_extractions')).rows.length, 0);
    await db.query("insert into organizer_item_suggestions(id,organizer_item_id,document_id,suggested_value,based_on) values ($1,$2,$3,$4,'Source')", [id(70),id(40),documentId,JSON.stringify('Suggested')]);
    await denied(id(11), "update organizer_item_suggestions set suggested_value='null',status='accepted'", /permission denied/);
    await denied(id(11), `select resolve_organizer_suggestion('${id(70)}',true)`, /no longer accepting/);
    await denied(id(12), `select resolve_organizer_suggestion('${id(70)}',true)`, /Not authorized/);
    await db.exec(`update organizers set status='sent' where id='${id(30)}'`);
    await asUser(id(11), `select resolve_organizer_suggestion('${id(70)}',true)`);
    assert.equal((await db.query(`select value from organizer_responses where organizer_item_id='${id(40)}'`)).rows[0].value, 'Suggested');
    await denied(id(11), `select resolve_organizer_suggestion('${id(70)}',true)`, /already resolved/);
    await db.query("insert into organizer_item_suggestions(id,organizer_item_id,document_id,suggested_value,based_on) values ($1,$2,$3,'123','Invalid text')", [id(71),id(40),documentId]);
    await denied(id(11), `select resolve_organizer_suggestion('${id(71)}',true)`, /Invalid answer/);
    assert.equal((await db.query(`select status from organizer_item_suggestions where id='${id(71)}'`)).rows[0].status, 'pending');
    await asUser(id(11), `select resolve_organizer_suggestion('${id(71)}',false)`);
    await db.exec(`insert into organizers(id,firm_id,client_id,tax_year,title,status,created_by) values ('${id(80)}','${id(2)}','${id(21)}',2025,'Other','sent','${id(12)}'); insert into organizer_items(id,organizer_id,prompt,response_type) values ('${id(81)}','${id(80)}','Other','text')`);
    await assert.rejects(db.query("insert into organizer_item_suggestions(organizer_item_id,document_id,suggested_value,based_on) values ($1,$2,'123','Bad source')", [id(81),documentId]), /same organizer/);
    await assert.rejects(db.exec(`update organizer_items set organizer_id='${id(80)}' where id='${id(40)}'`), /linked suggestions/);
    const hash = 'a'.repeat(64);
    await denied(id(11), `select reserve_otp_request('${hash}')`, /permission denied/);
    const reservations = await Promise.all([asUser(null, `select reserve_otp_request('${hash}') as reserved`, 'service_role'), asUser(null, `select reserve_otp_request('${hash}') as reserved`, 'service_role')]);
    assert.equal(reservations.filter(r=>r.rows[0].reserved).length, 1);
    await db.exec("update otp_request_log set requested_at=now()-interval '61 seconds'");
    assert.equal((await asUser(null, `select reserve_otp_request('${hash}') as reserved`, 'service_role')).rows[0].reserved, true);
    assert.equal((await db.query("select file_size_limit from storage.buckets where id='client-documents'")).rows[0].file_size_limit, 20971520);
    await asUser(id(10), `
      insert into organizer_templates(id,firm_id,name,tax_year,created_by)
      values ('${id(50)}','${id(1)}','1040 Annual Organizer',2025,'${id(10)}')
    `);
    await asUser(id(10), `
      insert into organizer_template_items(
        id,template_id,sort_order,section_title,prompt,response_type,is_required
      ) values (
        '${id(51)}','${id(50)}',0,'Income','Upload W-2','file',true
      )
    `);
    const duplicatedTemplateId = (await asUser(
      id(10),
      `select duplicate_organizer_template('${id(50)}',2026) as id`
    )).rows[0].id;
    const duplicatedTemplate = (await db.query(
      `select firm_id,name,tax_year from organizer_templates where id='${duplicatedTemplateId}'`
    )).rows[0];
    assert.equal(duplicatedTemplate.firm_id,id(1));
    assert.equal(duplicatedTemplate.name,'1040 Annual Organizer');
    assert.equal(duplicatedTemplate.tax_year,2026);
    const duplicatedItem = (await db.query(
      `select section_title,prompt,response_type,is_required from organizer_template_items where template_id='${duplicatedTemplateId}'`
    )).rows[0];
    assert.equal(duplicatedItem.section_title,'Income');
    assert.equal(duplicatedItem.prompt,'Upload W-2');
    assert.equal(duplicatedItem.response_type,'file');
    assert.equal(duplicatedItem.is_required,true);
    await denied(
      id(11),
      `select duplicate_organizer_template('${id(50)}',2027)`,
      /Not authorized/
    );

    await asUser(id(10), `
      insert into engagement_templates(id,firm_id,name,title,body,created_by)
      values (
        '${id(130)}','${id(1)}','Individual Engagement',
        'Tax Preparation Engagement','Original engagement terms','${id(10)}'
      )
    `);

    const engagementId = (await asUser(
      id(10),
      `select send_client_engagement('${id(20)}','${id(130)}') as id`
    )).rows[0].id;

    assert.equal(
      (await asUser(
        id(11),
        `select title,body,status from client_engagements where id='${engagementId}'`
      )).rows[0].body,
      'Original engagement terms'
    );
    assert.equal(
      (await asUser(id(12), `select id from client_engagements where id='${engagementId}'`)).rows.length,
      0
    );

    const usageSummary = (await asUser(
      id(10),
      `select get_firm_usage_summary() as summary`
    )).rows[0].summary;
    assert.equal(Number(usageSummary.clients) >= 1,true);
    await denied(
      id(11),
      `select get_firm_usage_summary()`,
      /Not authorized/
    );

    await asUser(
      id(10),
      `update engagement_templates set body='Updated future template text' where id='${id(130)}'`
    );
    assert.equal(
      (await db.query(
        `select body from client_engagements where id='${engagementId}'`
      )).rows[0].body,
      'Original engagement terms'
    );

    await denied(
      id(12),
      `select acknowledge_client_engagement('${engagementId}','Wrong Client')`,
      /Engagement not found/
    );

    const acknowledged = (await asUser(
      id(11),
      `select (acknowledge_client_engagement('${engagementId}','Client A')).*`
    )).rows[0];
    assert.equal(acknowledged.status,'acknowledged');
    assert.equal(acknowledged.acknowledged_by,id(11));
    assert.equal(acknowledged.acknowledged_name,'Client A');
    assert.ok(acknowledged.acknowledged_at);

    const withdrawnEngagementId = (await asUser(
      id(10),
      `select send_client_engagement('${id(20)}','${id(130)}') as id`
    )).rows[0].id;
    await asUser(
      id(10),
      `update client_engagements
       set status='withdrawn',withdrawn_at=now()
       where id='${withdrawnEngagementId}'`
    );
    assert.equal(
      (await asUser(id(11), `select id from client_engagements where id='${withdrawnEngagementId}'`)).rows.length,
      0
    );
    await denied(
      id(11),
      `select acknowledge_client_engagement('${withdrawnEngagementId}','Client A')`,
      /no longer available/
    );

    await denied(
      id(14),
      `select send_organizer('${id(20)}','${id(50)}',2026,'Reviewer bypass')`,
      /Not authorized to send organizers/
    );

    const firstOrganizerBatch = (await asUser(
      id(10),
      `select * from send_organizers_batch(
        array['${id(20)}'::uuid],
        '${id(50)}',
        2026,
        '2026 Annual Organizer'
      )`
    )).rows[0];
    assert.equal(firstOrganizerBatch.created_count,1);
    assert.equal(firstOrganizerBatch.skipped_count,0);

    const duplicateOrganizerBatch = (await asUser(
      id(10),
      `select * from send_organizers_batch(
        array['${id(20)}'::uuid,'${id(20)}'::uuid],
        '${id(50)}',
        2026,
        '2026 Annual Organizer'
      )`
    )).rows[0];
    assert.equal(duplicateOrganizerBatch.created_count,0);
    assert.equal(duplicateOrganizerBatch.skipped_count,1);

    await denied(
      id(10),
      `select * from send_organizers_batch(
        array['${id(21)}'::uuid],
        '${id(50)}',
        2026,
        'Wrong firm'
      )`,
      /unavailable/
    );

    await denied(
      id(14),
      `select * from send_organizers_batch(
        array['${id(20)}'::uuid],
        '${id(50)}',
        2027,
        'Reviewer batch'
      )`,
      /Not authorized to send organizers/
    );

    await denied(id(11), `select prepare_client_invitation('${id(20)}')`, /Not authorized/);
    await denied(id(10), `select prepare_client_invitation('${id(21)}')`, /Client not found/);
    assert.equal((await asUser(id(10), `select prepare_client_invitation('${id(20)}') as mode`)).rows[0].mode,'signin');
    await db.exec(`alter table auth.users disable trigger on_auth_user_created;
      insert into auth.users(id,email) values ('${id(90)}','existing@a.test');
      alter table auth.users enable trigger on_auth_user_created;
      insert into clients(id,firm_id,primary_contact_name,email,created_by) values
      ('${id(91)}','${id(1)}','Existing','existing@a.test','${id(10)}'),
      ('${id(92)}','${id(1)}','New','new@a.test','${id(10)}'),
      ('${id(93)}','${id(1)}','Staff conflict','staff@a.test','${id(10)}'),
      ('${id(94)}','${id(1)}','Other firm','client@b.test','${id(10)}')`);
    assert.equal((await asUser(id(10), `select prepare_client_invitation('${id(91)}') as mode`)).rows[0].mode,'signin');
    assert.equal((await db.query(`select profile_id from clients where id='${id(91)}'`)).rows[0].profile_id,id(90));
    assert.equal((await db.query(`select role from profiles where id='${id(90)}'`)).rows[0].role,'client');
    assert.equal((await asUser(id(10), `select prepare_client_invitation('${id(92)}') as mode`)).rows[0].mode,'invite');
    await denied(id(10), `select prepare_client_invitation('${id(93)}')`, /different access/);
    await denied(id(10), `select prepare_client_invitation('${id(94)}')`, /different access/);
    await db.exec(`update clients set status='archived' where id='${id(91)}'`);
    await denied(id(10), `select prepare_client_invitation('${id(91)}')`, /Restore this client/);
    // Clients can update only their own contact details through the guarded RPC.
    const directClientUpdate = await asUser(
      id(11),
      `update clients
       set phone='+1 999 999 9999'
       where id='${id(20)}'
       returning id`
    );
    assert.equal(directClientUpdate.rows.length,0);
    assert.equal(
      (await db.query(`select phone from clients where id='${id(20)}'`)).rows[0].phone,
      null
    );

    const clientContact = (await asUser(
      id(11),
      `select (
        update_client_contact_details(
          '${id(20)}',
          '+1 555 0100',
          '10 Main Street',
          'Suite 2',
          'Austin',
          'TX',
          '78701',
          'United States',
          'portal'
        )
      ).phone as phone`
    )).rows[0];
    assert.equal(clientContact.phone,'+1 555 0100');

    const storedContact = (await db.query(
      `select phone,address_line1,city,state_region,postal_code,country,
              preferred_contact_method,contact_updated_at
       from clients where id='${id(20)}'`
    )).rows[0];
    assert.equal(storedContact.address_line1,'10 Main Street');
    assert.equal(storedContact.city,'Austin');
    assert.equal(storedContact.state_region,'TX');
    assert.equal(storedContact.postal_code,'78701');
    assert.equal(storedContact.country,'United States');
    assert.equal(storedContact.preferred_contact_method,'portal');
    assert.ok(storedContact.contact_updated_at);

    await denied(
      id(11),
      `select update_client_contact_details(
        '${id(21)}',null,null,null,null,null,null,null,'portal'
      )`,
      /Not authorized/
    );

    await asUser(
      id(10),
      `select update_client_contact_details(
        '${id(20)}',
        '+1 555 0101',
        '10 Main Street',
        null,
        'Austin',
        'TX',
        '78701',
        'United States',
        'phone'
      )`
    );
    const staffUpdatedContact = (await db.query(
      `select phone,preferred_contact_method from clients where id='${id(20)}'`
    )).rows[0];
    assert.equal(staffUpdatedContact.phone,'+1 555 0101');
    assert.equal(staffUpdatedContact.preferred_contact_method,'phone');

    await denied(
      id(14),
      `select update_client_contact_details(
        '${id(20)}',null,null,null,null,null,null,null,'portal'
      )`,
      /Not authorized/
    );

    // General client messaging is immutable, idempotent, and tenant isolated.
    await denied(
      id(11),
      `insert into client_messages(firm_id,client_id,author_id,body,request_id)
       values ('${id(1)}','${id(20)}','${id(11)}','Bypass','${id(401)}')`,
      /permission denied/
    );

    const clientThreadMessage = (await asUser(
      id(11),
      `select (post_client_message('${id(20)}','Question for my tax professional','${id(402)}')).id as id`
    )).rows[0].id;

    assert.equal(
      (await asUser(
        id(10),
        `select body from client_messages where id='${clientThreadMessage}'`
      )).rows[0].body,
      'Question for my tax professional'
    );
    assert.equal(
      (await asUser(
        id(12),
        `select id from client_messages where id='${clientThreadMessage}'`
      )).rows.length,
      0
    );

    const retriedClientThreadMessage = (await asUser(
      id(11),
      `select (post_client_message('${id(20)}','Question for my tax professional','${id(402)}')).id as id`
    )).rows[0].id;
    assert.equal(retriedClientThreadMessage, clientThreadMessage);

    await denied(
      id(11),
      `select post_client_message('${id(20)}','Changed request','${id(402)}')`,
      /does not match/
    );
    await denied(
      id(11),
      `select post_client_message('${id(21)}','Wrong client','${id(403)}')`,
      /Not authorized/
    );

    assert.equal(
      (await asUser(
        id(10),
        `select count(*)::int as n from notifications
         where kind='client_message' and subject_client_id='${id(20)}'`
      )).rows[0].n,
      1
    );

    const staffThreadMessage = (await asUser(
      id(10),
      `select (post_client_message('${id(20)}','Secure reply from staff','${id(404)}')).id as id`
    )).rows[0].id;
    assert.ok(staffThreadMessage);

    const clientThreadNotice = (await asUser(
      id(11),
      `select id from notifications
       where kind='client_message' and subject_client_id='${id(20)}'
       order by created_at desc limit 1`
    )).rows[0];
    assert.ok(clientThreadNotice);

    await asUser(
      id(11),
      `select mark_client_message_notifications_read('${id(20)}',now())`
    );
    assert.ok(
      (await db.query(
        `select read_at from notifications where id='${clientThreadNotice.id}'`
      )).rows[0].read_at
    );

    // Ad-hoc document requests are staff-created, client-visible, tenant isolated, and sync from uploads.
    const documentRequestId = (await asUser(
      id(10),
      `select (create_document_request(
        '${id(20)}',
        'Upload brokerage 1099',
        'Please upload the complete consolidated statement.',
        '2026-10-05'
      )).id as id`
    )).rows[0].id;

    assert.equal(
      (await asUser(
        id(11),
        `select title,status from document_requests where id='${documentRequestId}'`
      )).rows[0].status,
      'open'
    );
    assert.equal(
      (await asUser(
        id(12),
        `select id from document_requests where id='${documentRequestId}'`
      )).rows.length,
      0
    );
    await denied(
      id(11),
      `select create_document_request('${id(20)}','Client bypass',null,null)`,
      /Not authorized/
    );
    const directRequestUpdate = await asUser(
      id(11),
      `update document_requests
       set status='cancelled'
       where id='${documentRequestId}'
       returning id`
    );
    assert.equal(directRequestUpdate.rows.length,0);
    assert.equal(
      (await db.query(
        `select status from document_requests where id='${documentRequestId}'`
      )).rows[0].status,
      'open'
    );

    assert.equal(
      (await asUser(
        id(11),
        `select count(*)::int as n from notifications
         where kind='document_request' and subject_client_id='${id(20)}'`
      )).rows[0].n,
      1
    );

    const batchRequestResult = (await asUser(
      id(10),
      `select * from create_document_requests_batch(
        array['${id(20)}'::uuid,'${id(22)}'::uuid],
        'Upload brokerage 1099',
        'Batch request test',
        '2026-10-05'
      )`
    )).rows[0];
    assert.equal(batchRequestResult.created_count,1);
    assert.equal(batchRequestResult.skipped_count,1);
    assert.equal(
      (await asUser(
        id(13),
        `select count(*)::int as n from document_requests
         where client_id='${id(22)}' and title='Upload brokerage 1099'`
      )).rows[0].n,
      1
    );
    await denied(
      id(10),
      `select * from create_document_requests_batch(
        array['${id(20)}'::uuid,'${id(21)}'::uuid],
        'Cross firm request',
        null,
        null
      )`,
      /unavailable or archived/
    );

    const requestedPath = `${id(1)}/${id(20)}/requests/${documentRequestId}/brokerage-1099.pdf`;
    await asUser(
      id(11),
      `insert into storage.objects(bucket_id,name)
       values ('client-documents','${requestedPath}')`
    );
    await asUser(
      id(11),
      `insert into documents(
        id,firm_id,client_id,uploaded_by,storage_path,file_name,
        mime_type,size_bytes,document_kind,document_request_id
      ) values (
        '${id(65)}','${id(1)}','${id(20)}','${id(11)}',
        '${requestedPath}','brokerage-1099.pdf','application/pdf',
        900,'source','${documentRequestId}'
      )`
    );

    const receivedRequest = (await db.query(
      `select status,received_at from document_requests where id='${documentRequestId}'`
    )).rows[0];
    assert.equal(receivedRequest.status,'received');
    assert.ok(receivedRequest.received_at);
    assert.equal(
      (await asUser(
        id(10),
        `select count(*)::int as n from notifications
         where kind='document_received' and subject_client_id='${id(20)}'`
      )).rows[0].n,
      1
    );

    await denied(
      id(10),
      `update documents
       set document_request_id='${documentRequestId}',client_id='${id(21)}',firm_id='${id(2)}'
       where id='${id(62)}'`,
      /same client and firm|Document request must belong/
    );

    await asUser(
      id(10),
      `update documents set status='reviewed' where id='${id(65)}'`
    );
    const reviewedRequest = (await db.query(
      `select status,reviewed_at from document_requests where id='${documentRequestId}'`
    )).rows[0];
    assert.equal(reviewedRequest.status,'reviewed');
    assert.ok(reviewedRequest.reviewed_at);

    const lateRequestPath = `${id(1)}/${id(20)}/requests/${documentRequestId}/late.pdf`;
    await asUser(
      id(11),
      `insert into storage.objects(bucket_id,name)
       values ('client-documents','${lateRequestPath}')`
    );
    await denied(
      id(11),
      `insert into documents(
        firm_id,client_id,uploaded_by,storage_path,file_name,document_request_id
      ) values (
        '${id(1)}','${id(20)}','${id(11)}',
        '${lateRequestPath}','late.pdf','${documentRequestId}'
      )`,
      /no longer accepting uploads/
    );

    // Message notifications route to the other party, are idempotent, and cannot leak across firms.
    const staffMessage = (await asUser(id(10), `select (post_organizer_message('${id(30)}','Please check the document','${id(201)}')).id as id`)).rows[0].id;
    await asUser(id(10), `select post_organizer_message('${id(30)}','Please check the document','${id(201)}')`);
    assert.equal((await db.query(`select count(*)::int as n from notifications where event_key='message:${staffMessage}'`)).rows[0].n,1);
    const clientNotification = (await asUser(id(11), `select id,kind from notifications where kind='message'`)).rows[0];
    assert.ok(clientNotification);
    assert.equal((await asUser(id(12), `select id from notifications where id='${clientNotification.id}'`)).rows.length,0);
    await denied(id(11), 'select recipient_email from notifications', /permission denied/);
    await denied(id(11), "update notifications set email_status='sent'", /permission denied/);
    await asUser(id(12), `select mark_notification_read('${clientNotification.id}')`);
    assert.equal((await db.query(`select read_at from notifications where id='${clientNotification.id}'`)).rows[0].read_at,null);
    await asUser(id(11), `select mark_notification_read('${clientNotification.id}')`);
    assert.ok((await db.query(`select read_at from notifications where id='${clientNotification.id}'`)).rows[0].read_at);
    await asUser(id(11), `select post_organizer_message('${id(30)}','Client reply','${id(202)}')`);
    assert.equal((await asUser(id(10), `select id from notifications where kind='message'`)).rows.length,1);
    await denied(id(12), `select post_organizer_message('${id(30)}','Wrong client','${id(203)}')`, /row-level security/);
    await denied(id(11), `select post_organizer_message('${id(30)}','Changed retry','${id(202)}')`, /does not match/);
    await denied(id(11), `select post_organizer_message('${id(30)}',repeat('x',5001),'${id(204)}')`, /message_body_length/);
    await db.exec(`update organizers set status='submitted' where id='${id(30)}'`);
    await denied(id(11), `select request_organizer_changes('${id(30)}','Fix')`, /Not authorized/);
    const previousCorrections=(await asUser(id(11), `select id from notifications where kind='changes_requested'`)).rows.length;
    await asUser(id(10), `select request_organizer_changes('${id(30)}','Please correct the amount')`);
    const reopened = (await db.query(`select status,submitted_at,change_request_reason from organizers where id='${id(30)}'`)).rows[0];
    assert.equal(reopened.status,'sent'); assert.equal(reopened.submitted_at,null);
    assert.equal(reopened.change_request_reason,'Please correct the amount');
    assert.equal((await asUser(id(11), `select id from notifications where kind='changes_requested'`)).rows.length,previousCorrections+1);
    await denied(id(10), `select request_organizer_changes('${id(30)}','Repeat')`, /not awaiting review/);
    // Email leases isolate concurrent workers; only a matching lease may finish.
    await denied(id(10), 'select * from claim_notification_emails()', /permission denied/);
    const claimed = (await asUser(null, `select * from claim_notification_emails('${id(30)}')`, 'service_role')).rows;
    assert.ok(claimed.length>0);
    assert.equal((await asUser(null, `select * from claim_notification_emails('${id(30)}')`, 'service_role')).rows.length,0);
    const notice=claimed[0];
    await asUser(null, `select finish_notification_email('${notice.id}','${id(999)}',true)`, 'service_role');
    assert.equal((await db.query(`select email_status from notifications where id='${notice.id}'`)).rows[0].email_status,'processing');
    await asUser(null, `select finish_notification_email('${notice.id}','${notice.lease_id}',false)`, 'service_role');
    assert.equal((await db.query(`select email_status from notifications where id='${notice.id}'`)).rows[0].email_status,'pending');
    await db.exec(`update notifications set next_attempt_at=now()-interval '1 second' where id='${notice.id}'`);
    const retry=(await asUser(null, `select * from claim_notification_emails('${id(30)}')`, 'service_role')).rows[0];
    assert.notEqual(retry.lease_id,notice.lease_id);
    await asUser(null, `select finish_notification_email('${retry.id}','${retry.lease_id}',true)`, 'service_role');
    assert.equal((await db.query(`select email_status from notifications where id='${retry.id}'`)).rows[0].email_status,'sent');

    // Final-return review is a controlled cycle. Direct table updates cannot
    // bypass it, and a non-admin preparer cannot approve their own work.
    const returnJobId = (await asUser(id(10), `
      insert into tax_return_jobs(
        firm_id,client_id,tax_year,return_type,status,preparer_id,reviewer_id,created_by
      ) values (
        '${id(1)}','${id(20)}',2025,'1040','preparing','${id(10)}','${id(14)}','${id(10)}'
      ) returning id
    `)).rows[0].id;

    const bulkUpdate = (await asUser(
      id(10),
      `select * from bulk_update_tax_return_jobs(
        array['${returnJobId}'::uuid],
        'high',
        'keep',
        null,
        'keep',
        null,
        'set',
        '2026-04-15'
      )`
    )).rows[0];
    assert.equal(bulkUpdate.updated_count,1);

    const bulkUpdatedJob = (await db.query(
      `select priority,to_char(due_date,'YYYY-MM-DD') as due_date from tax_return_jobs where id='${returnJobId}'`
    )).rows[0];
    assert.equal(bulkUpdatedJob.priority,'high');
    assert.equal(bulkUpdatedJob.due_date,'2026-04-15');

    await denied(
      id(11),
      `select * from bulk_update_tax_return_jobs(
        array['${returnJobId}'::uuid],
        'normal',
        'keep',
        null,
        'keep',
        null,
        'keep',
        null
      )`,
      /Not authorized/
    );

    await denied(
      id(10),
      `select * from bulk_update_tax_return_jobs(
        array['${returnJobId}'::uuid],
        null,
        'set',
        '${id(11)}',
        'keep',
        null,
        'keep',
        null
      )`,
      /Choose an active Admin, Manager, or Preparer/
    );

    // Repeated normalized fields on different source documents are valid.
    // Two 1099-INTs should not be treated as conflicting just because both
    // contain interest_income with different values.
    await db.exec(`
      insert into storage.objects(bucket_id,name) values
        ('client-documents','${id(1)}/${id(20)}/interest-a.pdf'),
        ('client-documents','${id(1)}/${id(20)}/interest-b.pdf');

      insert into documents(
        id,firm_id,client_id,uploaded_by,storage_path,file_name,status,tax_return_job_id
      ) values
        ('${id(301)}','${id(1)}','${id(20)}','${id(10)}','${id(1)}/${id(20)}/interest-a.pdf','interest-a.pdf','reviewed','${returnJobId}'),
        ('${id(302)}','${id(1)}','${id(20)}','${id(10)}','${id(1)}/${id(20)}/interest-b.pdf','interest-b.pdf','reviewed','${returnJobId}');

      insert into document_extractions(
        id,document_id,status,document_type,tax_year,fields,reviewed_by,reviewed_at
      ) values
        ('${id(311)}','${id(301)}','completed','1099-INT',2025,'[]','${id(14)}',now()),
        ('${id(312)}','${id(302)}','completed','1099-INT',2025,'[]','${id(14)}',now());

      insert into tax_return_source_values(
        firm_id,tax_return_job_id,document_id,extraction_id,field_name,field_label,value,accepted_by
      ) values
        ('${id(1)}','${returnJobId}','${id(301)}','${id(311)}','interest_income','Interest income','100.00','${id(14)}'),
        ('${id(1)}','${returnJobId}','${id(302)}','${id(312)}','interest_income','Interest income','250.00','${id(14)}');
    `);

    await denied(
      id(10),
      `update tax_return_jobs set status='ready_to_file' where id='${returnJobId}'`,
      /permission denied/
    );

    const firstReviewId = (await asUser(
      id(10),
      `select request_tax_return_review('${returnJobId}','Ready for final review') as id`
    )).rows[0].id;

    assert.equal(
      (await db.query(`select status from tax_return_jobs where id='${returnJobId}'`)).rows[0].status,
      'review'
    );

    await denied(
      id(10),
      `select * from bulk_update_tax_return_jobs(
        array['${returnJobId}'::uuid],
        null,
        'clear',
        null,
        'keep',
        null,
        'keep',
        null
      )`,
      /Resolve the active review/
    );

    const reviewRequestedNotice = (await asUser(
      id(14),
      `select id,kind,tax_return_job_id from notifications
       where kind='tax_return_review_requested'
         and tax_return_job_id='${returnJobId}'`
    )).rows[0];
    assert.ok(reviewRequestedNotice);
    assert.equal(reviewRequestedNotice.tax_return_job_id, returnJobId);
    assert.equal(
      (await asUser(
        id(11),
        `select id from notifications where id='${reviewRequestedNotice.id}'`
      )).rows.length,
      0
    );

    await denied(
      id(10),
      `select resolve_tax_return_review('${firstReviewId}','approved','Self approval')`,
      /preparer cannot approve|preparer cannot approve or resolve/
    );

    await asUser(
      id(14),
      `select resolve_tax_return_review('${firstReviewId}','approved','Reviewed and approved')`
    );

    let reviewedJob = (await db.query(
      `select status,efile_status,review_version from tax_return_jobs where id='${returnJobId}'`
    )).rows[0];
    assert.equal(reviewedJob.status,'ready_to_file');
    assert.equal(reviewedJob.efile_status,'ready');
    assert.equal(
      (await asUser(
        id(10),
        `select count(*)::int as n from notifications
         where kind='tax_return_review_approved'
           and tax_return_job_id='${returnJobId}'`
      )).rows[0].n,
      1
    );

    await asUser(id(10), `
      select update_tax_return_job(
        '${returnJobId}',
        'preparing',
        'normal',
        null,
        '${id(10)}',
        '${id(14)}',
        'not_needed',
        'not_ready'
      )
    `);
    reviewedJob = (await db.query(
      `select status,efile_status,review_version from tax_return_jobs where id='${returnJobId}'`
    )).rows[0];
    assert.equal(reviewedJob.status,'preparing');
    assert.equal(reviewedJob.efile_status,'not_ready');
    assert.equal(reviewedJob.review_version,2);

    await denied(
      id(10),
      `select update_tax_return_job(
        '${returnJobId}','ready_to_file','normal',null,
        '${id(10)}','${id(14)}','not_needed','ready'
      )`,
      /Reviewer approval is required/
    );

    const secondReviewId = (await asUser(
      id(10),
      `select request_tax_return_review('${returnJobId}',null) as id`
    )).rows[0].id;

    await asUser(
      id(14),
      `select resolve_tax_return_review('${secondReviewId}','changes_requested','Correct the return before filing')`
    );
    reviewedJob = (await db.query(
      `select status,review_version from tax_return_jobs where id='${returnJobId}'`
    )).rows[0];
    assert.equal(reviewedJob.status,'preparing');
    assert.equal(reviewedJob.review_version,3);
    assert.equal(
      (await asUser(
        id(10),
        `select count(*)::int as n from notifications
         where kind='tax_return_review_changes_requested'
           and tax_return_job_id='${returnJobId}'`
      )).rows[0].n,
      1
    );

    // A fresh approved cycle is required before delivery.
    const thirdReviewId = (await asUser(
      id(10),
      `select request_tax_return_review('${returnJobId}','Final filing review') as id`
    )).rows[0].id;
    await asUser(
      id(14),
      `select resolve_tax_return_review('${thirdReviewId}','approved','Approved for filing')`
    );

    // A final return copy is a delivery artifact, not source evidence. Linking
    // it must not invalidate the current review approval.
    const finalPath = `${id(1)}/${id(20)}/return-copies/${returnJobId}/final-return.pdf`;
    await db.exec(`
      insert into storage.objects(bucket_id,name)
      values ('client-documents','${finalPath}');

      insert into documents(
        id,firm_id,client_id,uploaded_by,storage_path,file_name,mime_type,
        size_bytes,status,tax_return_job_id,document_kind
      ) values (
        '${id(320)}','${id(1)}','${id(20)}','${id(10)}',
        '${finalPath}','2025-final-return.pdf','application/pdf',
        1234,'reviewed','${returnJobId}','return_copy'
      );
    `);

    let deliveryJob = (await db.query(
      `select status,review_version from tax_return_jobs where id='${returnJobId}'`
    )).rows[0];
    assert.equal(deliveryJob.status,'ready_to_file');
    assert.equal(deliveryJob.review_version,3);

    assert.equal(
      (await asUser(id(11), `select id from documents where id='${id(320)}'`)).rows.length,
      0
    );
    assert.equal(
      (await asUser(id(11), `select name from storage.objects where name='${finalPath}'`)).rows.length,
      0
    );

    await denied(
      id(10),
      `update documents set client_visible=true where id='${id(320)}'`,
      /controlled release workflow/
    );

    await denied(
      id(14),
      `select set_return_copy_visibility('${id(320)}',true)`,
      /accepted or completed/
    );

    await asUser(id(10), `
      select update_tax_return_job(
        '${returnJobId}',
        'accepted',
        'normal',
        null,
        '${id(10)}',
        '${id(14)}',
        'not_needed',
        'accepted'
      )
    `);

    const clientStatus = (await asUser(
      id(11),
      `select * from get_client_return_status() where id='${returnJobId}'`
    )).rows[0];
    assert.ok(clientStatus);
    assert.equal(clientStatus.client_stage, 'accepted');
    assert.equal(clientStatus.return_type, '1040');
    assert.equal('preparer_id' in clientStatus, false);
    assert.equal('reviewer_id' in clientStatus, false);
    assert.equal('priority' in clientStatus, false);
    assert.equal(
      (await asUser(id(12), `select * from get_client_return_status()`)).rows.length,
      0
    );
    await denied(
      id(10),
      `select * from get_client_return_status()`,
      /Client account required/
    );

    await asUser(
      id(14),
      `select set_return_copy_visibility('${id(320)}',true)`
    );

    assert.equal(
      (await asUser(id(11), `select id from documents where id='${id(320)}'`)).rows.length,
      1
    );
    assert.equal(
      (await asUser(id(11), `select name from storage.objects where name='${finalPath}'`)).rows.length,
      1
    );
    assert.equal(
      (await asUser(
        id(11),
        `select count(*)::int as n from notifications
         where kind='tax_return_copy_released'
           and tax_return_job_id='${returnJobId}'`
      )).rows[0].n,
      1
    );

    await asUser(
      id(14),
      `select set_return_copy_visibility('${id(320)}',false)`
    );

    assert.equal(
      (await asUser(id(11), `select id from documents where id='${id(320)}'`)).rows.length,
      0
    );
    assert.equal(
      (await asUser(id(11), `select name from storage.objects where name='${finalPath}'`)).rows.length,
      0
    );
    assert.equal(
      (await asUser(
        id(11),
        `select count(*)::int as n from notifications
         where kind='tax_return_copy_withdrawn'
           and tax_return_job_id='${returnJobId}'`
      )).rows[0].n,
      1
    );
  } finally { await db.close(); }
});
