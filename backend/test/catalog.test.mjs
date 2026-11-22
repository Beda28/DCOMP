import 'reflect-metadata';
import assert           from 'node:assert/strict';
import test             from 'node:test';
import { NestFactory }  from '@nestjs/core';
import { DataSource }   from 'typeorm';
import { AppModule }    from '../dist/app.module.js';
import { configureApp } from '../dist/app.config.js';
import { AuthService }  from '../dist/auth/auth.service.js';
import { hash }         from '../dist/auth/password.js';

if (process.env.DB_NAME !== 'dcomp_test') throw new Error('전용 dcomp_test DB에서만 실행할 수 있습니다.');

test('거래처·품목 API와 권한, 데이터 보존', async context => {
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);
  await app.listen(0, '0.0.0.0');

  const db       = app.get(DataSource);
  const auth     = app.get(AuthService);
  const base     = await app.getUrl();
  const password = 'catalog-test-password-123';
  const users    = [];
  const partners = [];
  const items    = [];
  let organizationId;
  const companyCode = '000124';
  let transaction;
  let document;

  const request = async (path, { method = 'GET', body, access, headers = {} } = {}) => {
    const response = await fetch(`${base}/api/v1/${path}`, {
      method,
      headers: {
        'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json',
        ...(access ? { Authorization: `Bearer ${access}` } : {}), ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };
  const error = (reply, status, code) => {
    assert.equal(reply.status, status, JSON.stringify(reply.body));
    assert.equal(reply.body.error.code, code);
    assert.equal(typeof reply.body.requestId, 'string');
  };

  try {
    organizationId = (await db.query("INSERT INTO organizations (name, code) VALUES ('Catalog test', ?)", [companyCode])).insertId;
    const passwordHash = await hash(password);
    for (const role of ['ADMIN', 'STAFF']) {
      const username = `catalog_${role.toLowerCase()}`;
      const result = await db.query('INSERT INTO users (organization_id, username, password_hash, role) VALUES (?, ?, ?, ?)', [organizationId, username, passwordHash, role]);
      users.push(result.insertId);
    }
    const admin = (await auth.login({ companyCode, username: 'catalog_admin', password })).data.accessToken;
    const staff = (await auth.login({ companyCode, username: 'catalog_staff', password })).data.accessToken;
    const create = async (path, body, access = admin) => {
      const reply = await request(path, { method: 'POST', body, access });
      if (reply.status === 201) (path === 'partners' ? partners : items).push(reply.body.data.id);
      return reply;
    };
    const partnerInput = { name: '거래처 %_=', roles: ['CUSTOMER', 'SUPPLIER'], bizNumber: '1234567890', contact: '02-123-4567', email: 'sales@example.com' };
    const itemInput = { sku: 'CATALOG-001', name: '품목 %_=', purchasePrice: '0.01', salePrice: '9999999999999.99' };
    let partner;
    let item;

    await context.test('로그인 필수, 직원 변경 권한과 CSRF 차단', async () => {
      for (const path of ['partners', 'items', 'partners/1', 'items/1']) error(await request(path), 401, 'UNAUTHORIZED');
      for (const method of ['POST']) {
        error(await request(method === 'POST' ? 'items' : 'items/1', { method, access: staff, body: method === 'DELETE' ? undefined : itemInput }), 403, 'FORBIDDEN');
      }
      error(await request('partners/4294967295', { method: 'DELETE', access: staff }), 404, 'PARTNER_NOT_FOUND');
      error(await request('partners', { method: 'POST', access: staff, body: partnerInput, headers: { 'X-Requested-With': '' } }), 403, 'FORBIDDEN');
      error(await request('items', { method: 'POST', access: admin, body: itemInput, headers: { Origin: 'https://other.example.com' } }), 403, 'FORBIDDEN');
    });

    await context.test('직원 거래처 등록·상세, 관리자 품목 등록과 금액 정밀도', async () => {
      const partnerReply = await create('partners', partnerInput, staff);
      const itemReply = await create('items', itemInput);
      assert.equal(partnerReply.status, 201, JSON.stringify(partnerReply.body));
      assert.equal(itemReply.status, 201, JSON.stringify(itemReply.body));
      partner = partnerReply.body.data;
      item = itemReply.body.data;
      assert.deepEqual(partner, { ...partnerInput, organizationId, id: partner.id, bizNumber: '123-45-67890', status: 'ACTIVE' });
      assert.deepEqual(item, { ...itemInput, organizationId, id: item.id, unit: 'EA', status: 'ACTIVE' });
      assert.deepEqual((await request(`partners/${partner.id}`, { access: staff })).body.data, partner);
      assert.deepEqual((await request(`items/${item.id}`, { access: staff })).body.data, item);
      const minimal = await create('items', { sku: 'CATALOG-002', name: '기본값' });
      assert.equal(minimal.status, 201);
      assert.deepEqual(minimal.body.data, { id: minimal.body.data.id, organizationId, sku: 'CATALOG-002', name: '기본값', unit: 'EA', purchasePrice: null, salePrice: null, status: 'ACTIVE' });
    });

    await context.test('사업자번호 정규화와 SKU 대소문자 중복·동시 등록 충돌', async () => {
      error(await create('partners', { ...partnerInput, bizNumber: '123-45-67890' }), 409, 'DUPLICATE_BIZ_NUMBER');
      error(await create('items', { ...itemInput, sku: 'catalog-001' }), 409, 'DUPLICATE_SKU');
      const replies = await Promise.all([create('items', { sku: 'RACE', name: '동시' }), create('items', { sku: 'race', name: '동시' })]);
      assert.deepEqual(replies.map(reply => reply.status).sort(), [201, 409]);
      const partnerReplies = await Promise.all([
        create('partners', { name: '동시', roles: ['CUSTOMER'], bizNumber: '9998877777' }),
        create('partners', { name: '동시', roles: ['SUPPLIER'], bizNumber: '999-88-77777' }),
      ]);
      assert.deepEqual(partnerReplies.map(reply => reply.status).sort(), [201, 409]);
    });

    await context.test('필수 입력·역할·금액·추가 필드·빈 수정 검증', async () => {
      for (const body of [
        { ...partnerInput, name: ' ' }, { ...partnerInput, roles: [] }, { ...partnerInput, roles: ['ADMIN'] },
        { ...partnerInput, roles: ['CUSTOMER', 'CUSTOMER'] }, { ...partnerInput, roles: null },
        { ...partnerInput, bizNumber: 'invalid' }, { ...partnerInput, email: 'invalid' }, { ...partnerInput, status: 'INACTIVE' },
      ]) error(await create('partners', body), 400, 'VALIDATION_ERROR');
      for (const price of [-1, 10, '-0.01', '0.001', '10000000000000', '1e3', 'NaN', '01.00']) {
        error(await create('items', { ...itemInput, salePrice: price }), 400, 'VALIDATION_ERROR');
      }
      for (const body of [{ ...itemInput, sku: '' }, { ...itemInput, unit: null }, { ...itemInput, name: null }, { ...itemInput, status: 'INACTIVE' }]) {
        error(await create('items', body), 400, 'VALIDATION_ERROR');
      }
      for (const [path, access] of [[`partners/${partner.id}`, staff], [`items/${item.id}`, admin]]) {
        for (const body of [{}, { name: null }, { status: 'INACTIVE' }]) error(await request(path, { method: 'PATCH', access, body }), 400, 'VALIDATION_ERROR');
      }
    });

    await context.test('목록 검색·역할·페이지·특수문자 검색과 잘못된 조회 검증', async () => {
      const list = await request('partners?role=SUPPLIER&q=%25_%3D&limit=1&page=1&status=ACTIVE', { access: staff });
      assert.equal(list.status, 200);
      assert.deepEqual(list.body, { data: [partner], meta: { page: 1, limit: 1, total: 1 } });
      assert.deepEqual((await request('items?q=%25_%3D', { access: staff })).body.data, [item]);
      assert.deepEqual((await request('items?q=catalog-001', { access: staff })).body.data, [item]);
      const page1 = (await request('items?limit=1&page=1', { access: staff })).body;
      const page2 = (await request('items?limit=1&page=2', { access: staff })).body;
      assert.equal(page1.meta.total, items.length);
      assert.ok(page1.data[0].id > page2.data[0].id);
      for (const query of ['limit=101', 'limit=0', 'page=0', 'page=1.5', 'page=NaN', 'q[x]=a', 'q=a&q=b', 'status=DISABLED', 'role=ADMIN', 'other=x']) {
        error(await request(`partners?${query}`, { access: staff }), 400, 'VALIDATION_ERROR');
      }
      for (const path of ['partners', 'items']) {
        for (const id of ['0', '-1', '1.5', 'abc', '4294967296']) error(await request(`${path}/${id}`, { access: staff }), 400, 'VALIDATION_ERROR');
        const code = path === 'partners' ? 'PARTNER_NOT_FOUND' : 'ITEM_NOT_FOUND';
        for (const method of ['GET', 'PATCH', 'DELETE']) {
          error(await request(`${path}/4294967295`, { method, access: admin, body: method === 'PATCH' ? { name: '없음' } : undefined }), 404, code);
        }
      }
    });

    await context.test('부분 수정 보존, 선택값 비우기, 수정 중 중복 충돌', async () => {
      const reply = await request(`partners/${partner.id}`, { method: 'PATCH', access: staff, body: { contact: '', email: null } });
      assert.equal(reply.status, 200);
      assert.deepEqual(reply.body.data, { ...partner, contact: null, email: null });
      const price = await request(`items/${item.id}`, { method: 'PATCH', access: admin, body: { purchasePrice: null, salePrice: '0' } });
      assert.equal(price.status, 200);
      assert.deepEqual(price.body.data, { ...item, purchasePrice: null, salePrice: '0.00' });
      error(await request(`items/${items[1]}`, { method: 'PATCH', access: admin, body: { sku: item.sku } }), 409, 'DUPLICATE_SKU');
      error(await request(`partners/${partners[1]}`, { method: 'PATCH', access: admin, body: { bizNumber: '1234567890' } }), 409, 'DUPLICATE_BIZ_NUMBER');
    });

    await context.test('역할·품목 수정과 비활성화 후 거래 스냅샷·문서 연결 보존', async () => {
      transaction = (await db.query("INSERT INTO transactions (organization_id, number, partner_id, created_by, assignee_id, type, occurred_at) VALUES (?, '0123456789abcdef', ?, ?, ?, 'SALE', '2026-11-18')", [organizationId, partner.id, users[0], users[0]])).insertId;
      await db.query(`INSERT INTO transaction_lines (organization_id, transaction_id, item_id, position, quantity, unit_price, line_amount, item_sku_snapshot, item_name_snapshot)
        VALUES (?, ?, ?, 1, '2', '5.01', '10.02', ?, ?)`, [organizationId, transaction, item.id, item.sku, item.name]);
      document = (await db.query(`INSERT INTO documents (organization_id, partner_id, transaction_id, uploaded_by, kind, original_filename, content_type, size_bytes, storage_key, sha256)
        VALUES (?, ?, ?, ?, 'RECEIPT', 'catalog.png', 'image/png', 10, 'catalog-history.png', ?)`, [organizationId, partner.id, transaction, users[0], 'a'.repeat(64)])).insertId;
      assert.equal((await request(`partners/${partner.id}`, { method: 'PATCH', access: staff, body: { roles: ['SUPPLIER'] } })).status, 200);
      assert.equal((await request(`items/${item.id}`, { method: 'PATCH', access: admin, body: { sku: 'CHANGED', name: '수정 품목', salePrice: '999.99' } })).status, 200);
      for (const path of [`partners/${partner.id}`, `items/${item.id}`]) {
        assert.deepEqual(await request(path, { method: 'DELETE', access: admin }), { status: 204, body: null });
        assert.equal((await request(path, { method: 'DELETE', access: admin })).status, 204);
        assert.equal((await request(path, { access: staff })).body.data.status, 'INACTIVE');
      }
      const [line] = await db.query('SELECT item_sku_snapshot, item_name_snapshot, unit_price, line_amount FROM transaction_lines WHERE transaction_id = ?', [transaction]);
      assert.deepEqual(line, { item_sku_snapshot: item.sku, item_name_snapshot: item.name, unit_price: '5.01', line_amount: '10.02' });
      const [doc] = await db.query('SELECT partner_id, transaction_id FROM documents WHERE id = ?', [document]);
      assert.deepEqual(doc, { partner_id: partner.id, transaction_id: transaction });
      for (const path of ['partners', 'items']) {
        const inactive = await request(`${path}?status=INACTIVE`, { access: staff });
        assert.equal(inactive.body.meta.total, 1);
        const active = await request(`${path}?status=ACTIVE`, { access: staff });
        assert.ok(active.body.data.every(row => row.status === 'ACTIVE'));
      }
    });
  }
  finally {
    if (document) await db.query('DELETE FROM documents WHERE id = ?', [document]);
    if (transaction) {
      await db.query('DELETE FROM transaction_lines WHERE transaction_id = ?', [transaction]);
      await db.query('DELETE FROM transactions WHERE id = ?', [transaction]);
    }
    for (const id of partners) await db.query('DELETE FROM partners WHERE id = ?', [id]);
    for (const id of items) await db.query('DELETE FROM items WHERE id = ?', [id]);
    for (const id of users) {
      await db.query('DELETE FROM auth_sessions WHERE user_id = ?', [id]);
      await db.query('DELETE FROM users WHERE id = ?', [id]);
    }
    if (organizationId) await db.query('DELETE FROM organizations WHERE id = ?', [organizationId]);
    await app.close();
  }
});
