import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { searchPattern, quoteSearchPattern } from '../src/lib/search-pattern.ts';
import { PGlite } from '@electric-sql/pglite';

function search({ profile = { role: 'firm_staff', is_active: true }, failTable, data = {} } = {}) {
  const calls = [];
  let connections = 0;
  const client = { from(table) {
    const call = { table };
    calls.push(call);
    const builder = {};
    for (const method of ['select', 'or', 'ilike', 'order', 'limit', 'in', 'eq']) {
      builder[method] = (...args) => { call[method] = args; return builder; };
    }
    builder.then = resolve => {
      const relationship = { documents: 'documents_client_firm_fk', organizers: 'organizers_client_firm_fk' }[table];
      const ambiguous = relationship && !call.select[0].includes(`clients!${relationship}(`);
      return Promise.resolve({ data: data[table] ?? [], error: ambiguous || failTable === table ? { code: 'PGRST201', message: 'private database detail' } : null }).then(resolve);
    };
    return builder;
  } };
  const exports = {};
  const source = fs.readFileSync(new URL('../src/app/dashboard/search/page.tsx', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports,
    require(name) {
      if (name === 'react/jsx-runtime') return jsx;
      if (name === 'next/link') return { __esModule: true, default: ({ children, ...props }) => jsx.jsx('a', { ...props, children }) };
      if (name === 'next/navigation') return { redirect(path) { throw new Error(`redirect:${path}`); } };
      if (name === '@/lib/auth') return { getCurrentProfile: async () => profile };
      if (name === '@/lib/search-pattern') return { searchPattern, quoteSearchPattern };
      if (name === '@/lib/supabase/server') return { createClient: async () => { connections++; return client; } };
      throw new Error(name);
    },
  });
  return { calls, connections: () => connections, render: async q => renderToStaticMarkup(await exports.default({ searchParams: Promise.resolve({ q }) })) };
}

test('search denies signed-out, disabled, and client accounts before querying', async () => {
  for (const [profile, redirect] of [[null, '/login'], [{ role: 'firm_staff', is_active: false }, '/auth/access-disabled'], [{ role: 'client', is_active: true }, '/portal']]) {
    const page = search({ profile });
    await assert.rejects(page.render('tax'), { message: `redirect:${redirect}` });
    assert.equal(page.connections(), 0);
  }
});

test('empty, short and oversized searches do not issue database requests', async () => {
  for (const q of [undefined, ' ', 'a', 'x'.repeat(201)]) {
    const page = search();
    const html = await page.render(q);
    assert.equal(page.connections(), 0);
    assert.match(html, /role="search"/);
    assert.match(html, /for="workspace-search"/);
    if (q?.length > 200) assert.match(html, /Use 200 characters or fewer/);
  }
});

test('search quotes punctuation, bounds all queries, and resolves tenant-aware relationships', async () => {
  const page = search();
  const q = 'Acme, Inc. ("West")\\100%_';
  const html = await page.render(q);
  assert.match(html, /No matching records/);
  assert.doesNotMatch(html, /could not be loaded/);
  assert.equal(page.calls.length, 5);
  for (const call of page.calls) assert.equal(call.limit[0], 20);
  const expected = quoteSearchPattern(searchPattern(q));
  assert.equal(page.calls[0].or[0], `primary_contact_name.ilike.${expected},email.ilike.${expected}`);
  assert.equal(page.calls[3].or[0], `title.ilike.${expected},details.ilike.${expected}`);
});

test('search reports partial failures without claiming no matches or exposing database details', async () => {
  for (const failTable of ['clients', 'documents', 'organizers', 'staff_tasks', 'client_tags', 'client_tag_assignments', 'tax_return_jobs']) {
    const page = search({ failTable, data: { client_tags: [{ id: 'tag', name: 'Tax' }] } });
    const html = await page.render('2025');
    assert.match(html, /role="alert"/);
    assert.match(html, /Some results could not be loaded/);
    assert.doesNotMatch(html, /No matching records|private database detail/);
  }
});

test('client matches load related returns, and array parameters use the first query', async () => {
  const page = search({ data: { clients: [{ id: 'client', primary_contact_name: 'Acme', email: 'a@example.test', client_type: 'business' }] } });
  assert.match(await page.render(['Acme', 'ignored']), /Acme/);
  const returns = page.calls.find(call => call.table === 'tax_return_jobs');
  assert.deepEqual(Array.from(returns.in[1]), ['client']);
  assert.equal(returns.limit[0], 20);
});

test('escaped LIKE patterns match literal percent, underscore and backslash in PostgreSQL', async () => {
  const db = new PGlite();
  try {
    for (const q of ['100%', 'A_B', 'C:\\folder', 'Acme, Inc. ("West")']) {
      const result = await db.query('select $1::text ilike $2::text as matched, $3::text ilike $2::text as unrelated', [q, searchPattern(q), 'unrelated']);
      assert.equal(result.rows[0].matched, true);
      assert.equal(result.rows[0].unrelated, false);
    }
  } finally { await db.close(); }
});
