import 'reflect-metadata';
import assert           from 'node:assert/strict';
import test             from 'node:test';
import { createServer } from 'node:http';
import { NestFactory }  from '@nestjs/core';
import { DataSource }   from 'typeorm';
import { AppModule }    from '../dist/app.module.js';
import { configureApp } from '../dist/app.config.js';
import { AuthService }  from '../dist/auth/auth.service.js';
import { hash }         from '../dist/auth/password.js';

if (process.env.DB_NAME !== 'dcomp_test') throw new Error('전용 dcomp_test DB에서만 실행할 수 있습니다.');

test('문서 검색 권한·보정 반영·필터·서비스 장애', async context => {
  process.env.DOCUMENT_WORKER_ENABLED = 'false';
  let received;
  let responseStatus = 200;
  let beforeResponse = async () => {};
  const processor = createServer(async (request, response) => {
    let text = '';
    for await (const chunk of request) text += chunk;
    received = JSON.parse(text);
    await beforeResponse();
    response.writeHead(responseStatus, { 'Content-Type': 'application/json' });
    const offset = (received.page - 1) * received.limit;
    response.end(JSON.stringify({ data: received.documents.slice(offset, offset + received.limit).map(row => ({ id: row.id, score: 1, snippet: row.text.slice(0, 100) })), total: received.documents.length }));
  });
  await new Promise(resolve => processor.listen(0, '0.0.0.0', resolve));
  process.env.FASTAPI_URL = `http://127.0.0.1:${processor.address().port}`;
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);
  await app.listen(0, '0.0.0.0');
  const db   = app.get(DataSource);
  const auth = app.get(AuthService);
  const base = `${await app.getUrl()}/api/v1/search/documents`;
  const companies = [];
  const query = async (access, params = 'q=invoice') => {
    const response = await fetch(`${base}?${params}`, { headers: access ? { Authorization: `Bearer ${access}` } : {} });
    return { status: response.status, body: await response.json() };
  };
  try {
    const password = 'search-test-password-123';
    const passwordHash = await hash(password);
    for (const code of ['000150', '000151']) {
      const id = (await db.query('INSERT INTO organizations (name, code) VALUES (?, ?)', [`Search ${code}`, code])).insertId;
      const company = { id, code, documents: [] };
      companies.push(company);
      for (const username of ['admin', 'staff', 'colleague']) {
        company[`${username}Id`] = (await db.query('INSERT INTO users (organization_id, username, password_hash, role) VALUES (?, ?, ?, ?)',
          [id, username, passwordHash, username === 'admin' ? 'ADMIN' : 'STAFF'])).insertId;
        company[username] = (await auth.login({ companyCode: code, username, password })).data.accessToken;
      }
      company.partner = (await db.query("INSERT INTO partners (organization_id, name, is_supplier) VALUES (?, '검색 공급사', 1)", [id])).insertId;
      company.transaction = (await db.query("INSERT INTO transactions (organization_id, number, partner_id, created_by, assignee_id, type, occurred_at) VALUES (?, '0123456789abcdef', ?, ?, ?, 'PURCHASE', '2026-11-22')",
        [id, company.partner, company.staffId, company.staffId])).insertId;
      for (const [index, uploader] of ['staff', 'colleague', 'admin'].entries()) {
        const row = await db.query(`INSERT INTO documents
          (organization_id, uploaded_by, partner_id, transaction_id, kind, original_filename, content_type, size_bytes, storage_key, sha256, status, ocr_text, corrected_text, corrected_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 'image/png', 1, ?, ?, 'READY', '옛 자동 원문', '최신 보정 내용', ?, '2026-11-22 10:00:00')`,
        [id, company[`${uploader}Id`], index === 2 ? company.partner : null, index === 2 ? company.transaction : null,
          index === 2 ? 'INVOICE' : 'RECEIPT', `invoice-${index}.png`, `search-${id}-${index}`, 'a'.repeat(64), JSON.stringify({ title: '최신 상호', date: '2026-11-22', amount: '100.00', bizNumber: null })]);
        company.documents.push(row.insertId);
      }
    }
    const [own, foreign] = companies;
    await context.test('회사·담당자 필터를 검색 서비스 전달 전에 적용', async () => {
      assert.equal((await query()).status, 401);
      const reply = await query(own.staff);
      assert.equal(reply.status, 200, JSON.stringify(reply.body));
      assert.equal(reply.body.meta.total, 2);
      assert.deepEqual(received.documents.map(row => row.id).sort(), [own.documents[0], own.documents[2]].sort());
      assert.ok(received.documents.every(row => !foreign.documents.includes(row.id)));
      assert.equal((await query(own.admin)).body.meta.total, 3);
      assert.equal((await query(own.colleague)).body.meta.total, 1);
      assert.equal((await query(own.staff, `q=x&transactionId=${foreign.transaction}`)).body.meta.total, 0);
    });
    await context.test('보정 내용·보정 필드 우선, 빈 문자열 보정도 원문으로 되돌리지 않음', async () => {
      await query(own.staff);
      assert.ok(received.documents.every(row => row.text.includes('최신 보정 내용') && row.text.includes('최신 상호') && !row.text.includes('옛 자동 원문')));
      await db.query("UPDATE documents SET corrected_text = '' WHERE id = ?", [own.documents[0]]);
      await query(own.staff);
      assert.ok(!received.documents.find(row => row.id === own.documents[0]).text.includes('옛 자동 원문'));
    });
    await context.test('종류·거래처·날짜·페이지 검증과 필터 적용', async () => {
      const reply = await query(own.staff, `q=x&kind=INVOICE&partnerId=${own.partner}&from=2026-11-22&to=2026-11-22`);
      assert.equal(reply.body.meta.total, 1);
      assert.equal(reply.body.data[0].id, own.documents[2]);
      assert.equal((await query(own.staff, 'q=x&from=2026-11-23')).body.meta.total, 0);
      const first = await query(own.admin, 'q=x&limit=1&page=1');
      const next = await query(own.admin, 'q=x&limit=1&page=2');
      assert.equal(first.body.meta.total, 3);
      assert.notEqual(first.body.data[0].id, next.body.data[0].id);
      for (const params of ['', 'q=', 'q=%20', 'q=x&organizationId=1', 'q=x&limit=101', 'q=x&from=2026-02-30']) assert.equal((await query(own.staff, params)).status, 400);
    });
    await context.test('검색 중 담당자 변경 시 이전 권한의 결과를 반환하지 않음', async () => {
      beforeResponse = async () => { await db.query('UPDATE transactions SET assignee_id = ? WHERE id = ?', [own.colleagueId, own.transaction]); };
      const reply = await query(own.staff);
      assert.equal(reply.status, 409);
      assert.equal(reply.body.error.code, 'SEARCH_CHANGED');
      beforeResponse = async () => {};
      assert.equal((await query(own.staff)).body.meta.total, 1);
    });
    await context.test('검색 장애 응답과 복구', async () => {
      responseStatus = 503;
      const reply = await query(own.admin);
      assert.equal(reply.status, 503);
      assert.equal(reply.body.error.code, 'SEARCH_UNAVAILABLE');
      responseStatus = 200;
      assert.equal((await query(own.admin)).status, 200);
    });
  }
  finally {
    for (const { id } of companies) {
      await db.query('DELETE FROM documents WHERE organization_id = ?', [id]);
      await db.query('DELETE FROM transactions WHERE organization_id = ?', [id]);
      await db.query('DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM users WHERE organization_id = ?)', [id]);
      for (const table of ['partners', 'users', 'organizations']) await db.query(`DELETE FROM ${table} WHERE ${table === 'organizations' ? 'id' : 'organization_id'} = ?`, [id]);
    }
    await app.close();
    await new Promise(resolve => processor.close(resolve));
    delete process.env.FASTAPI_URL;
  }
});
