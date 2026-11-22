import 'reflect-metadata';
import assert           from 'node:assert/strict';
import test             from 'node:test';
import { createServer } from 'node:http';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir }       from 'node:os';
import { join }         from 'node:path';
import { NestFactory }  from '@nestjs/core';
import { DataSource }   from 'typeorm';
import { AppModule }    from '../dist/app.module.js';
import { configureApp } from '../dist/app.config.js';
import { AuthService }  from '../dist/auth/auth.service.js';
import { DocumentWorker } from '../dist/documents/document-worker.service.js';
import { hash }         from '../dist/auth/password.js';

if (process.env.DB_NAME !== 'dcomp_test') throw new Error('전용 dcomp_test DB에서만 실행할 수 있습니다.');

test('문서 업로드·권한·보정·작업 복구', async context => {
  const folder = await mkdtemp(join(tmpdir(), 'dcomp-documents-'));
  process.env.UPLOAD_DIR = folder;
  process.env.DOCUMENT_WORKER_ENABLED = 'false';
  process.env.DOCUMENT_QUEUE_PREFIX = `document-test-${Date.now()}`;
  let processingStatus = 200;
  let processingDelay = 0;
  const processor = createServer(async (request, response) => {
    request.resume();
    if (processingDelay) await new Promise(resolve => setTimeout(resolve, processingDelay));
    response.writeHead(processingStatus, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ text: '자동 인식 합계 12345', fields: { title: '테스트상사', date: '2026-11-22', amount: '12345.00', bizNumber: null } }));
  });
  await new Promise(resolve => processor.listen(0, '0.0.0.0', resolve));
  process.env.FASTAPI_URL = `http://127.0.0.1:${processor.address().port}`;
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);
  await app.listen(0, '0.0.0.0');
  const db     = app.get(DataSource);
  const auth   = app.get(AuthService);
  const worker = app.get(DocumentWorker);
  const base   = `${await app.getUrl()}/api/v1`;
  const companies = [];
  const png = Buffer.from('89504e470d0a1a0a00000000', 'hex');
  const request = async (path, { method = 'GET', body, access, headers = {} } = {}) => {
    const response = await fetch(`${base}/${path}`, {
      method, headers: { 'X-Requested-With': 'XMLHttpRequest', ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(access ? { Authorization: `Bearer ${access}` } : {}), ...headers },
      body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };
  const upload = (access, { key, bytes = png, fields = {}, filename = 'document.png', headers = {} } = {}) => {
    const body = new FormData();
    body.set('file', new Blob([bytes], { type: 'image/png' }), filename);
    body.set('kind', 'RECEIPT');
    for (const [name, value] of Object.entries(fields)) body.set(name, String(value));
    return request('documents', { method: 'POST', access, body, headers: { ...(key ? { 'Idempotency-Key': key } : {}), ...headers } });
  };
  const error = (reply, status, code) => {
    assert.equal(reply.status, status, JSON.stringify(reply.body));
    if (code) assert.equal(reply.body.error.code, code);
  };
  try {
    const password = 'document-test-password-123';
    const passwordHash = await hash(password);
    for (const code of ['000140', '000141']) {
      const id = (await db.query('INSERT INTO organizations (name, code) VALUES (?, ?)', [`Document ${code}`, code])).insertId;
      const company = { id, code };
      companies.push(company);
      for (const username of ['admin', 'staff', 'other']) {
        company[`${username}Id`] = (await db.query('INSERT INTO users (organization_id, username, password_hash, role) VALUES (?, ?, ?, ?)',
          [id, username, passwordHash, username === 'admin' ? 'ADMIN' : 'STAFF'])).insertId;
        company[username] = (await auth.login({ companyCode: code, username, password })).data.accessToken;
      }
      company.partner = (await db.query("INSERT INTO partners (organization_id, name, is_supplier) VALUES (?, '문서 공급사', 1)", [id])).insertId;
      company.transaction = (await db.query("INSERT INTO transactions (organization_id, number, partner_id, created_by, assignee_id, type, occurred_at) VALUES (?, '0123456789abcdef', ?, ?, ?, 'PURCHASE', '2026-11-22')",
        [id, company.partner, company.staffId, company.staffId])).insertId;
    }
    const [own, foreign] = companies;
    const get = async (id, access = own.staff) => {
      const reply = await request(`documents/${id}`, { access });
      assert.equal(reply.status, 200, JSON.stringify(reply.body));
      return reply.body.data;
    };
    let document;

    await context.test('파일·메타데이터 검증과 인증·CSRF·회사 위조 차단', async () => {
      error(await upload(), 401);
      error(await upload(own.staff, { headers: { 'X-Requested-With': '' } }), 403);
      error(await upload(own.staff, { bytes: Buffer.from('<script>bad</script>') }), 415, 'UNSUPPORTED_FILE');
      error(await upload(own.staff, { bytes: Buffer.alloc(0) }), 400, 'FILE_REQUIRED');
      error(await upload(own.staff, { fields: { organizationId: foreign.id } }), 400);
      error(await upload(own.staff, { fields: { partnerId: foreign.partner } }), 404, 'PARTNER_NOT_FOUND');
      error(await upload(own.staff, { fields: { transactionId: foreign.transaction } }), 404, 'TRANSACTION_NOT_FOUND');
      error(await upload(own.other, { fields: { transactionId: own.transaction } }), 404, 'TRANSACTION_NOT_FOUND');
      error(await upload(own.staff, { key: 'short' }), 400);
      error(await upload(own.staff, { bytes: Buffer.alloc(20 * 1024 * 1024 + 1) }), 413);
    });

    await context.test('동일 요청 동시 업로드 멱등성과 파일·큐 작업 한 번만 저장', async () => {
      const replies = await Promise.all([upload(own.staff, { key: 'same-request-key' }), upload(own.staff, { key: 'same-request-key' })]);
      assert.ok(replies.every(reply => reply.status === 201), JSON.stringify(replies));
      assert.equal(replies[0].body.data.id, replies[1].body.data.id);
      document = replies[0].body.data;
      assert.equal(document.jobs.length, 1);
      assert.equal(document.jobs[0].status, 'PENDING_ENQUEUE');
      assert.equal(document.status, 'UPLOADED');
      assert.equal(document.storageKey, undefined);
      assert.equal(document.uploadRequestHash, undefined);
      assert.equal((await readdir(join(folder, String(own.id)))).length, 1);
      error(await upload(own.staff, { key: 'same-request-key', filename: 'changed.png' }), 409, 'UPLOAD_KEY_CONFLICT');
      const response = await fetch(`${base}/documents/${document.id}/file`, { headers: { Authorization: `Bearer ${own.staff}` } });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'image/png');
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
    });

    await context.test('미연결 문서는 업로더·관리자만 접근, 모든 경로의 회사 격리', async () => {
      for (const access of [own.other, foreign.admin]) {
        for (const suffix of ['', '/file', '/edits']) error(await request(`documents/${document.id}${suffix}`, { access }), 404, 'DOCUMENT_NOT_FOUND');
        error(await request(`documents/${document.id}/retry`, { method: 'POST', access, body: { expectedRevision: 0 } }), 404);
        error(await request(`documents/${document.id}/corrections`, { method: 'PATCH', access, body: { expectedRevision: 0, correctedText: 'x' } }), 404);
        assert.equal((await request('documents', { access })).body.meta.total, 0);
      }
      assert.equal((await get(document.id, own.admin)).id, document.id);
    });

    await context.test('거래 연결과 재배정 후 이전 담당자·원래 업로더도 접근 차단', async () => {
      const reply = await request(`documents/${document.id}/links`, { method: 'PATCH', access: own.staff,
        body: { expectedRevision: 0, transactionId: own.transaction } });
      assert.equal(reply.status, 200, JSON.stringify(reply.body));
      assert.equal(reply.body.data.partnerId, own.partner);
      await db.query('UPDATE transactions SET assignee_id = ? WHERE id = ?', [own.otherId, own.transaction]);
      error(await request(`documents/${document.id}`, { access: own.staff }), 404);
      error(await upload(own.staff, { key: 'same-request-key' }), 404);
      assert.equal((await get(document.id, own.other)).id, document.id);
      error(await request(`documents/${document.id}/links`, { method: 'PATCH', access: own.other,
        body: { expectedRevision: 1, transactionId: null } }), 403);
      await db.query('UPDATE transactions SET assignee_id = ? WHERE id = ?', [own.staffId, own.transaction]);
    });

    await context.test('OCR 완료·보정 동시성·원문 및 수정 전후 이력 보존', async () => {
      error(await request(`documents/${document.id}/corrections`, { method: 'PATCH', access: own.staff, body: { expectedRevision: 1, correctedText: '대기 중' } }), 409, 'DOCUMENT_BUSY');
      await worker.process({ data: { documentId: document.id, version: 1 } });
      document = await get(document.id);
      assert.equal(document.status, 'READY');
      assert.equal(document.revision, 2);
      const replies = await Promise.all(['수동 보정 A', '수동 보정 B'].map(correctedText => request(`documents/${document.id}/corrections`, {
        method: 'PATCH', access: own.staff, body: { expectedRevision: 2, correctedText, correctedJson: { title: '보정 상호', amount: '12.34' } },
      })));
      assert.deepEqual(replies.map(reply => reply.status).sort(), [200, 409]);
      document = await get(document.id);
      assert.equal(document.ocrText, '자동 인식 합계 12345');
      assert.ok(document.correctedText.startsWith('수동 보정'));
      assert.equal(document.correctedJson.amount, '12.34');
      const history = (await request(`documents/${document.id}/edits`, { access: own.staff })).body;
      assert.equal(history.meta.total, 1);
      assert.equal(history.data[0].beforeText, document.ocrText);
      assert.equal(history.data[0].afterText, document.correctedText);
      assert.equal(history.data[0].editorId, own.staffId);
      for (const correctedJson of [null, [], { amount: '-1' }, { date: '2026-02-30' }, { unknown: 'bad' }]) {
        error(await request(`documents/${document.id}/corrections`, { method: 'PATCH', access: own.staff, body: { expectedRevision: 3, correctedJson } }), 400);
      }
    });

    await context.test('재처리 버전·낡은 작업 무시·사용자 보정 유지·실패 후 수동 보정', async () => {
      const reply = await request(`documents/${document.id}/retry`, { method: 'POST', access: own.staff, body: { expectedRevision: document.revision } });
      assert.equal(reply.status, 200, JSON.stringify(reply.body));
      assert.equal(reply.body.data.currentJobVersion, 2);
      error(await request(`documents/${document.id}/retry`, { method: 'POST', access: own.staff, body: { expectedRevision: 4 } }), 409, 'DOCUMENT_BUSY');
      await worker.process({ data: { documentId: document.id, version: 1 } });
      assert.equal((await get(document.id)).status, 'UPLOADED');
      await worker.process({ data: { documentId: document.id, version: 2 } });
      const processed = await get(document.id);
      assert.equal(processed.correctedText, document.correctedText);
      assert.deepEqual(processed.correctedJson, document.correctedJson);
      assert.equal(processed.status, 'READY');
      await request(`documents/${document.id}/retry`, { method: 'POST', access: own.staff, body: { expectedRevision: processed.revision } });
      processingStatus = 422;
      await assert.rejects(worker.process({ data: { documentId: document.id, version: 3 } }));
      document = await get(document.id);
      assert.equal(document.status, 'FAILED');
      assert.equal(document.jobs[0].attempts, 1);
      assert.equal(document.jobs[0].errorCode, 'OCR_FAILED');
      assert.equal((await request(`documents/${document.id}/corrections`, { method: 'PATCH', access: own.staff,
        body: { expectedRevision: document.revision, correctedText: '실패 후 수동 보정' } })).status, 200);
      processingStatus = 200;
    });

    await context.test('한글 장문 보정과 입력 길이 상한', async () => {
      const current = await get(document.id);
      const correctedText = '가'.repeat(100000);
      const reply = await request(`documents/${document.id}/corrections`, { method: 'PATCH', access: own.staff,
        body: { expectedRevision: current.revision, correctedText } });
      assert.equal(reply.status, 200, JSON.stringify(reply.body.error));
      assert.equal(reply.body.data.correctedText, correctedText);
      error(await request(`documents/${document.id}/corrections`, { method: 'PATCH', access: own.staff,
        body: { expectedRevision: current.revision + 1, correctedText: correctedText + '가' } }), 400);
      assert.equal((await request(`documents/${document.id}/corrections`, { method: 'PATCH', access: own.staff,
        body: { expectedRevision: current.revision + 1, correctedText: '실패 후 수동 보정' } })).status, 200);
    });

    await context.test('실제 Redis 큐로 미등록 작업 복구와 작업자 기동 후 완료', async () => {
      const reply = await upload(own.staff, { filename: 'queued.png' });
      assert.equal(reply.status, 201);
      const id = reply.body.data.id;
      process.env.DOCUMENT_WORKER_ENABLED = 'true';
      await worker.onModuleInit();
      await worker.dispatch();
      const deadline = Date.now() + 15000;
      let current;
      do {
        current = await get(id);
        if (current.status === 'READY') break;
        await new Promise(resolve => setTimeout(resolve, 100));
      } while (Date.now() < deadline);
      assert.equal(current.status, 'READY', JSON.stringify(current));
      assert.equal(current.jobs[0].attempts, 1);
      assert.equal(current.jobs[0].status, 'COMPLETED');
      const result = await request(`documents?q=${encodeURIComponent('실패 후 수동')}`, { access: own.staff });
      assert.equal(result.body.meta.total, 1);
      assert.equal(result.body.data[0].id, document.id);
      for (const query of ['organizationId=1', 'from=2026-11-23&to=2026-11-22', 'kind=BAD', 'page=0']) error(await request(`documents?${query}`, { access: own.staff }), 400);
    });

    await context.test('작업자 재시작과 일시 장애 자동 3회 재시도 후 실패 보존', async () => {
      await worker.onModuleDestroy();
      processingStatus = 503;
      const reply = await upload(own.staff, { filename: 'retry.png' });
      assert.equal(reply.status, 201);
      await worker.onModuleInit();
      const deadline = Date.now() + 20000;
      let current;
      do {
        current = await get(reply.body.data.id);
        if (current.status === 'FAILED') break;
        await new Promise(resolve => setTimeout(resolve, 100));
      } while (Date.now() < deadline);
      assert.equal(current.status, 'FAILED', JSON.stringify(current));
      assert.equal(current.jobs[0].attempts, 3);
      assert.ok(current.jobs[0].errorMessage);
      processingStatus = 200;
    });

    await context.test('종료 시 진행 중 OCR 결과를 저장한 뒤 작업자 연결 종료', async () => {
      processingDelay = 300;
      const reply = await upload(own.staff, { filename: 'shutdown.png' });
      await worker.dispatch();
      const deadline = Date.now() + 5000;
      while ((await get(reply.body.data.id)).status !== 'PROCESSING' && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.equal((await get(reply.body.data.id)).status, 'PROCESSING');
      await worker.onModuleDestroy();
      assert.equal((await get(reply.body.data.id)).status, 'READY');
      processingDelay = 0;
    });

    await context.test('거래처 변경 시 연결 문서의 거래처와 수정 버전도 함께 갱신', async () => {
      const previous = await get(document.id);
      const partnerId = (await db.query("INSERT INTO partners (organization_id, name, is_supplier) VALUES (?, '변경 공급사', 1)", [own.id])).insertId;
      const itemId = (await db.query("INSERT INTO items (organization_id, sku, name) VALUES (?, 'DOC-ITEM', '문서 품목')", [own.id])).insertId;
      await db.query("INSERT INTO transaction_lines (organization_id, transaction_id, item_id, position, quantity, unit_price, line_amount, item_sku_snapshot, item_name_snapshot) VALUES (?, ?, ?, 1, 1, 1, 1, 'DOC-ITEM', '문서 품목')", [own.id, own.transaction, itemId]);
      const reply = await request(`transactions/${own.transaction}`, { method: 'PATCH', access: own.staff, body: { expectedRevision: 0, partnerId } });
      assert.equal(reply.status, 200, JSON.stringify(reply.body));
      const current = await get(document.id);
      assert.equal(current.partnerId, partnerId);
      assert.equal(current.revision, previous.revision + 1);
    });
  }
  finally {
    await worker.onModuleDestroy();
    for (const { id } of companies) {
      await db.query('DELETE FROM document_jobs WHERE document_id IN (SELECT id FROM documents WHERE organization_id = ?)', [id]);
      for (const table of ['document_edits', 'documents', 'transaction_lines', 'transactions', 'items']) await db.query(`DELETE FROM ${table} WHERE organization_id = ?`, [id]);
      await db.query('DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM users WHERE organization_id = ?)', [id]);
      for (const table of ['partners', 'users', 'organizations']) await db.query(`DELETE FROM ${table} WHERE ${table === 'organizations' ? 'id' : 'organization_id'} = ?`, [id]);
    }
    await app.close();
    await new Promise(resolve => processor.close(resolve));
    await rm(folder, { recursive: true, force: true });
    delete process.env.UPLOAD_DIR;
    delete process.env.FASTAPI_URL;
    process.env.DOCUMENT_WORKER_ENABLED = 'false';
  }
});
