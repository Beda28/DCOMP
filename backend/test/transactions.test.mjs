import 'reflect-metadata';
import assert           from 'node:assert/strict';
import test             from 'node:test';
import { NestFactory }  from '@nestjs/core';
import { DataSource }   from 'typeorm';
import { AppModule }    from '../dist/app.module.js';
import { configureApp } from '../dist/app.config.js';
import { AuthService }  from '../dist/auth/auth.service.js';
import { TransactionsService } from '../dist/transactions/transactions.service.js';
import { hash }         from '../dist/auth/password.js';

if (process.env.DB_NAME !== 'dcomp_test') throw new Error('전용 dcomp_test DB에서만 실행할 수 있습니다.');

test('거래 API·금액·상태 전이·회사 격리', async context => {
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);
  await app.listen(0, '0.0.0.0');

  const db       = app.get(DataSource);
  const auth     = app.get(AuthService);
  const base     = await app.getUrl();
  const password = 'transaction-test-password-123';
  const companies = [];

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
    const passwordHash = await hash(password);
    for (const code of ['000130', '000131']) {
      const id = (await db.query('INSERT INTO organizations (name, code) VALUES (?, ?)', [`Transaction ${code}`, code])).insertId;
      const company = { id, code };
      companies.push(company);
      for (const role of ['ADMIN', 'STAFF']) {
        const username = role.toLowerCase();
        const user = await db.query('INSERT INTO users (organization_id, username, password_hash, role) VALUES (?, ?, ?, ?)', [id, username, passwordHash, role]);
        company[`${username}Id`] = user.insertId;
        company[username] = (await auth.login({ companyCode: code, username, password })).data.accessToken;
      }
      company.partner = (await db.query("INSERT INTO partners (organization_id, name, is_customer, is_supplier) VALUES (?, '공용 %_=', 1, 1)", [id])).insertId;
      company.customer = (await db.query("INSERT INTO partners (organization_id, name, is_customer) VALUES (?, '고객사', 1)", [id])).insertId;
      company.item = (await db.query("INSERT INTO items (organization_id, sku, name, purchase_price, sale_price) VALUES (?, 'ORIGINAL', '원래 품목', '100', '200')", [id])).insertId;
      company.second = (await db.query("INSERT INTO items (organization_id, sku, name) VALUES (?, 'SECOND', '두번째 품목')", [id])).insertId;
    }
    const [own, other] = companies;
    const input = { type: 'PURCHASE', partnerId: own.partner, occurredAt: '2026-11-19', memo: '초안 %_=', lines: [{ itemId: own.item, quantity: '1.005', unitPrice: '1' }] };
    const create = (body = input, access = own.staff) => request('transactions', { method: 'POST', access, body });
    const mutate = (id, action, access = own.staff, body) => request(`transactions/${id}${action ? `/${action}` : ''}`, { method: action ? 'POST' : 'PATCH', access, body });
    const detail = async id => {
      const reply = await request(`transactions/${id}`, { access: own.staff });
      assert.equal(reply.status, 200, JSON.stringify(reply.body));
      return reply.body.data;
    };
    let transaction;

    await context.test('인증·CSRF 및 서버 소유 필드 주입 차단', async () => {
      error(await request('transactions'), 401, 'UNAUTHORIZED');
      error(await request('transactions', { method: 'POST', body: input, access: own.staff, headers: { 'X-Requested-With': '' } }), 403, 'FORBIDDEN');
      for (const extra of [{ organizationId: other.id }, { totalAmount: '1' }, { number: 'INJECT' }, { status: 'CONFIRMED' }, { createdBy: own.adminId }]) {
        error(await create({ ...input, ...extra }), 400, 'VALIDATION_ERROR');
      }
    });

    await context.test('직원 초안 생성·반올림·서버 합계와 스냅샷', async () => {
      const reply = await create({ ...input, lines: [...input.lines, { itemId: own.second, quantity: '0.005', unitPrice: '1' }] });
      assert.equal(reply.status, 201, JSON.stringify(reply.body));
      transaction = reply.body.data;
      assert.equal(transaction.status, 'DRAFT');
      assert.equal(transaction.createdBy, own.staffId);
      assert.equal(transaction.organizationId, own.id);
      assert.equal(transaction.revision, 0);
      assert.equal(transaction.totalAmount, '1.02');
      assert.equal(transaction.partnerName, '공용 %_=');
      assert.deepEqual(transaction.lines.map(line => line.lineAmount), ['1.01', '0.01']);
      assert.deepEqual(transaction.lines.map(line => line.position), [1, 2]);
      assert.equal(transaction.lines[0].itemNameSnapshot, '원래 품목');
      assert.equal(transaction.lines[0].unitPrice, '1.00');
      assert.match(transaction.number, /^[0-9a-f]{16}$/);
      assert.equal(transaction.assigneeId, own.staffId);
      assert.equal(transaction.assigneeName, 'staff');
      assert.equal(transaction.isUnread, false);
      assert.deepEqual(await detail(transaction.id), transaction);
    });

    await context.test('수량·금액·날짜·중복 품목·중첩 입력 검증', async () => {
      for (const quantity of [0, '0', '0.000', '-1', '01', '1e3', 'NaN', '0.0001', '1000000000', null, '', ' 1']) {
        error(await create({ ...input, lines: [{ ...input.lines[0], quantity }] }), 400, 'VALIDATION_ERROR');
      }
      for (const unitPrice of [1, '-0.01', '0.001', '01', '1e3', '10000000000000', null]) {
        error(await create({ ...input, lines: [{ ...input.lines[0], unitPrice }] }), 400, 'VALIDATION_ERROR');
      }
      for (const occurredAt of ['2026-02-30', '2025-02-29', '2026-11-19T00:00:00Z', '0999-01-01', null]) {
        error(await create({ ...input, occurredAt }), 400, 'VALIDATION_ERROR');
      }
      for (const lines of [[], null, {}, [null], [[input.lines[0]]], [input.lines[0], input.lines[0]], Array(101).fill(input.lines[0]), [{ ...input.lines[0], itemNameSnapshot: '위조' }]]) {
        error(await create({ ...input, lines }), 400, 'VALIDATION_ERROR');
      }
      error(await create({ ...input, partnerId: String(own.partner) }), 400, 'VALIDATION_ERROR');
      error(await create({ ...input, lines: [{ ...input.lines[0], itemId: String(own.item) }] }), 400, 'VALIDATION_ERROR');
      const leap = await create({ ...input, occurredAt: '2028-02-29', lines: [{ itemId: own.item, quantity: '0.001', unitPrice: '0' }] });
      assert.equal(leap.status, 201, JSON.stringify(leap.body));
      assert.equal(leap.body.data.totalAmount, '0.00');
    });

    await context.test('부동소수점 한계 이상의 정확한 계산·금액 범위 초과 롤백', async () => {
      const exact = await create({ ...input, lines: [{ itemId: own.item, quantity: '900719.925', unitPrice: '10000000000' }] });
      assert.equal(exact.status, 201, JSON.stringify(exact.body));
      assert.equal(exact.body.data.totalAmount, '9007199250000000.00');
      const [{ total: before }] = await db.query('SELECT COUNT(*) total FROM transactions WHERE organization_id = ?', [own.id]);
      for (const lines of [
        [{ itemId: own.item, quantity: '999999999.999', unitPrice: '9999999999999.99' }],
        [own.item, own.second].map(itemId => ({ itemId, quantity: '600000000', unitPrice: '1000000000' })),
      ]) error(await create({ ...input, lines }), 400, 'VALIDATION_ERROR');
      const [{ total: after }] = await db.query('SELECT COUNT(*) total FROM transactions WHERE organization_id = ?', [own.id]);
      assert.equal(before, after);
    });

    await context.test('거래처 역할·비활성 거래처와 품목 검증', async () => {
      error(await create({ ...input, partnerId: own.customer }), 422, 'PARTNER_ROLE_MISMATCH');
      assert.equal((await create({ ...input, type: 'SALE', partnerId: own.customer })).status, 201);
      await db.query("UPDATE partners SET status = 'INACTIVE' WHERE id = ?", [own.customer]);
      error(await create({ ...input, type: 'SALE', partnerId: own.customer }), 422, 'PARTNER_INACTIVE');
      await db.query("UPDATE items SET status = 'INACTIVE' WHERE id = ?", [own.second]);
      error(await create({ ...input, lines: [{ ...input.lines[0], itemId: own.second }] }), 422, 'ITEM_INACTIVE');
      error(await mutate(transaction.id, 'confirm'), 422, 'ITEM_INACTIVE');
      await db.query("UPDATE items SET status = 'ACTIVE' WHERE id = ?", [own.second]);
    });

    await context.test('다른 회사 거래·연관 ID는 404, 회사 내 취소 권한은 403', async () => {
      const foreign = await create({ ...input, partnerId: other.partner, lines: [{ ...input.lines[0], itemId: other.item }] }, other.staff);
      assert.equal(foreign.status, 201, JSON.stringify(foreign.body));
      const foreignId = foreign.body.data.id;
      error(await request(`transactions/${foreignId}`, { access: own.staff }), 404, 'TRANSACTION_NOT_FOUND');
      for (const action of ['', 'confirm', 'cancel']) error(await mutate(foreignId, action, own.staff, action ? undefined : { expectedRevision: 0, memo: '침범' }), 404, 'TRANSACTION_NOT_FOUND');
      error(await mutate(transaction.id, 'cancel'), 403, 'FORBIDDEN');
      error(await create({ ...input, partnerId: other.partner }), 404, 'PARTNER_NOT_FOUND');
      error(await create({ ...input, lines: [{ ...input.lines[0], itemId: other.item }] }), 404, 'ITEM_NOT_FOUND');
      error(await mutate(transaction.id, '', own.staff, { expectedRevision: 0, partnerId: other.partner }), 404, 'PARTNER_NOT_FOUND');
      error(await mutate(transaction.id, '', own.staff, { expectedRevision: 0, lines: [{ ...input.lines[0], itemId: other.item }] }), 404, 'ITEM_NOT_FOUND');
      assert.deepEqual(await detail(transaction.id), transaction);
    });

    await context.test('부분 수정·라인 교체·기존 스냅샷 보존', async () => {
      await db.query("UPDATE items SET sku = 'RENAMED', name = '바뀐 품목', purchase_price = '999' WHERE id = ?", [own.item]);
      const memo = await mutate(transaction.id, '', own.staff, { expectedRevision: 0, memo: null });
      assert.equal(memo.status, 200, JSON.stringify(memo.body));
      assert.equal(memo.body.data.memo, null);
      assert.equal(memo.body.data.type, 'PURCHASE');
      assert.equal(memo.body.data.partnerId, own.partner);
      assert.deepEqual(memo.body.data.lines, transaction.lines);
      const revised = await mutate(transaction.id, '', own.staff, { expectedRevision: 1, lines: [{ itemId: own.item, quantity: '2.5', unitPrice: '3.21' }] });
      assert.equal(revised.status, 200, JSON.stringify(revised.body));
      assert.equal(revised.body.data.totalAmount, '8.03');
      assert.equal(revised.body.data.lines.length, 1);
      assert.equal(revised.body.data.lines[0].itemSkuSnapshot, 'ORIGINAL');
      assert.equal(revised.body.data.lines[0].itemNameSnapshot, '원래 품목');
      assert.equal(revised.body.data.revision, 2);
      transaction = revised.body.data;
      for (const body of [{}, { expectedRevision: 2 }, { expectedRevision: '2', memo: 'x' }, { expectedRevision: 2, memo: 'x', revision: 3 }, { expectedRevision: 2, type: null }]) {
        error(await mutate(transaction.id, '', own.staff, body), 400, 'VALIDATION_ERROR');
      }
      error(await mutate(transaction.id, '', own.staff, { expectedRevision: 0, memo: '낡은 요청' }), 409, 'REVISION_CONFLICT');
    });

    await context.test('라인 저장 실패 시 신규 거래·수정 내용 전체 롤백', async () => {
      const before = await detail(transaction.id);
      const [{ total }] = await db.query('SELECT COUNT(*) total FROM transactions WHERE organization_id = ?', [own.id]);
      await db.query('ALTER TABLE transaction_lines ADD CONSTRAINT reject_test_transaction_line CHECK (unit_price <> 13.37)');
      try {
        const lines = [{ itemId: own.item, quantity: '1', unitPrice: '13.37' }];
        error(await create({ ...input, lines }), 500, 'INTERNAL_ERROR');
        error(await mutate(transaction.id, '', own.staff, { expectedRevision: 2, memo: '실패', lines }), 500, 'INTERNAL_ERROR');
        assert.deepEqual(await detail(transaction.id), before);
        const [after] = await db.query('SELECT COUNT(*) total FROM transactions WHERE organization_id = ?', [own.id]);
        assert.equal(after.total, total);
      }
      finally { await db.query('ALTER TABLE transaction_lines DROP CHECK reject_test_transaction_line'); }
    });

    await context.test('동시 수정은 한 번만 성공하고 합계·라인·revision 일치', async () => {
      const replies = await Promise.all(['4', '5'].map(unitPrice => mutate(transaction.id, '', own.staff, {
        expectedRevision: 2, lines: [{ itemId: own.item, quantity: '3', unitPrice }],
      })));
      assert.deepEqual(replies.map(reply => reply.status).sort(), [200, 409]);
      transaction = await detail(transaction.id);
      assert.equal(transaction.revision, 3);
      assert.equal(transaction.totalAmount, replies.find(reply => reply.status === 200).body.data.totalAmount);
      assert.equal(transaction.lines[0].lineAmount, transaction.totalAmount);
    });

    await context.test('확정 경합·확정 후 수정 금지·관리자 취소와 이력 보존', async () => {
      const replies = await Promise.all([mutate(transaction.id, 'confirm'), mutate(transaction.id, 'confirm')]);
      assert.deepEqual(replies.map(reply => reply.status).sort(), [200, 409]);
      const confirmed = await detail(transaction.id);
      assert.equal(confirmed.status, 'CONFIRMED');
      assert.equal(confirmed.revision, 4);
      assert.ok(confirmed.confirmedAt.endsWith('Z'));
      error(await mutate(transaction.id, '', own.staff, { expectedRevision: 4, memo: '변경' }), 409, 'INVALID_TRANSACTION_STATE');
      error(await mutate(transaction.id, 'cancel'), 403, 'FORBIDDEN');
      const canceled = await mutate(transaction.id, 'cancel', own.admin);
      assert.equal(canceled.status, 200, JSON.stringify(canceled.body));
      assert.equal(canceled.body.data.status, 'CANCELED');
      assert.equal(canceled.body.data.revision, 5);
      assert.equal(canceled.body.data.confirmedAt, confirmed.confirmedAt);
      assert.ok(canceled.body.data.canceledAt.endsWith('Z'));
      assert.deepEqual(canceled.body.data.lines, confirmed.lines);
      assert.equal(canceled.body.data.totalAmount, confirmed.totalAmount);
      for (const action of ['confirm', 'cancel']) error(await mutate(transaction.id, action, own.admin), 409, 'INVALID_TRANSACTION_STATE');
      error(await mutate(transaction.id, '', own.admin, { expectedRevision: 5, memo: '변경' }), 409, 'INVALID_TRANSACTION_STATE');
    });

    await context.test('초안 취소와 확정·취소 경합', async () => {
      const draft = (await create()).body.data;
      const replies = await Promise.all([mutate(draft.id, 'confirm'), mutate(draft.id, 'cancel', own.admin)]);
      assert.equal(replies[1].status, 200, JSON.stringify(replies));
      assert.ok([200, 409].includes(replies[0].status));
      assert.equal((await detail(draft.id)).status, 'CANCELED');
      const another = (await create()).body.data;
      const canceled = await mutate(another.id, 'cancel', own.admin);
      assert.equal(canceled.status, 200);
      assert.equal(canceled.body.data.confirmedAt, null);
    });

    await context.test('같은 회사 다른 직원의 목록·상세·변경·읽음 접근과 담당자 위조 차단', async () => {
      const id = (await db.query("INSERT INTO users (organization_id, username, password_hash, role) VALUES (?, 'colleague', ?, 'STAFF')", [own.id, passwordHash])).insertId;
      own.colleagueId = id;
      own.colleague = (await auth.login({ companyCode: own.code, username: 'colleague', password })).data.accessToken;
      const draft = (await create()).body.data;
      const hidden = await request(`transactions?q=${draft.number}&assigneeId=${own.staffId}`, { access: own.colleague });
      assert.deepEqual(hidden.body.data, []);
      assert.equal(hidden.body.meta.total, 0);
      error(await request(`transactions/${draft.id}`, { access: own.colleague }), 404, 'TRANSACTION_NOT_FOUND');
      for (const action of ['', 'confirm', 'cancel', 'read']) {
        error(await mutate(draft.id, action, own.colleague, action ? undefined : { expectedRevision: 0, memo: '침범' }), 404, 'TRANSACTION_NOT_FOUND');
      }
      for (const access of [own.colleague, other.admin]) {
        error(await request(`transactions/${draft.id}/assignee`, { method: 'PATCH', access, body: { assigneeId: id, expectedRevision: 0 } }), 404, 'TRANSACTION_NOT_FOUND');
      }
      error(await request(`transactions/${draft.id}/assignee`, { method: 'PATCH', access: own.staff, body: { assigneeId: id, expectedRevision: 0 } }), 403, 'FORBIDDEN');
      error(await create({ ...input, assigneeId: id }), 400, 'VALIDATION_ERROR');
      error(await mutate(draft.id, '', own.staff, { expectedRevision: 0, assigneeId: id }), 400, 'VALIDATION_ERROR');
      assert.equal((await request(`transactions/${draft.id}`, { access: own.admin })).status, 200);
      assert.equal((await detail(draft.id)).assigneeId, own.staffId);
    });

    await context.test('관리자 재배정·활성 직원 검증·이전 담당자 차단·사용자별 미열람 보존', async () => {
      const draft = (await create()).body.data;
      const assign = (assigneeId, expectedRevision = 0) => request(`transactions/${draft.id}/assignee`, {
        method: 'PATCH', access: own.admin, body: { assigneeId, expectedRevision },
      });
      error(await assign(other.staffId), 404, 'USER_NOT_FOUND');
      await db.query("UPDATE users SET status = 'DISABLED' WHERE id = ?", [own.colleagueId]);
      error(await assign(own.colleagueId), 422, 'USER_INACTIVE');
      await db.query("UPDATE users SET status = 'ACTIVE' WHERE id = ?", [own.colleagueId]);
      for (const assigneeId of [null, '1', 0]) error(await assign(assigneeId), 400, 'VALIDATION_ERROR');
      error(await assign(own.colleagueId, 9), 409, 'REVISION_CONFLICT');

      const changed = await assign(own.colleagueId);
      assert.equal(changed.status, 200, JSON.stringify(changed.body));
      assert.equal(changed.body.data.createdBy, own.staffId);
      assert.equal(changed.body.data.creatorName, 'staff');
      assert.equal(changed.body.data.assigneeName, 'colleague');
      error(await request(`transactions/${draft.id}`, { access: own.staff }), 404, 'TRANSACTION_NOT_FOUND');
      error(await mutate(draft.id, 'confirm'), 404, 'TRANSACTION_NOT_FOUND');
      const list = async access => (await request(`transactions?q=${draft.number}`, { access })).body;
      assert.equal((await list(own.staff)).meta.total, 0);
      assert.equal((await list(own.colleague)).data[0].isUnread, true);
      assert.equal((await request(`transactions/${draft.id}`, { access: own.colleague })).body.data.isUnread, true);
      assert.equal((await mutate(draft.id, 'read', own.colleague)).status, 204);
      assert.equal((await mutate(draft.id, 'read', own.colleague)).status, 204);
      assert.equal((await list(own.colleague)).data[0].isUnread, false);
      assert.equal((await list(own.admin)).data[0].isUnread, true);
      assert.equal((await assign(own.staffId, 1)).status, 200);
      assert.equal((await assign(own.colleagueId, 2)).status, 200);
      assert.equal((await list(own.colleague)).data[0].isUnread, false);
      assert.equal((await mutate(draft.id, 'confirm', own.colleague)).status, 200);
      assert.equal((await assign(own.staffId, 4)).status, 200);
      assert.equal((await detail(draft.id)).status, 'CONFIRMED');
      error(await mutate(draft.id, 'cancel'), 403, 'FORBIDDEN');
    });

    await context.test('재배정과 이전 담당자 수정 경합은 권한·revision을 원자적으로 검사', async () => {
      const draft = (await create()).body.data;
      const replies = await Promise.all([
        request(`transactions/${draft.id}/assignee`, { method: 'PATCH', access: own.admin, body: { assigneeId: own.colleagueId, expectedRevision: 0 } }),
        mutate(draft.id, '', own.staff, { expectedRevision: 0, memo: '기존 담당자 수정' }),
      ]);
      assert.equal(replies.filter(reply => reply.status === 200).length, 1, JSON.stringify(replies));
      assert.ok(replies.every(reply => [200, 404, 409].includes(reply.status)));
      const saved = (await request(`transactions/${draft.id}`, { access: own.admin })).body.data;
      assert.equal(saved.revision, 1);
      assert.equal(saved.assigneeId, replies[0].status === 200 ? own.colleagueId : own.staffId);
    });

    await context.test('16진수 거래번호 동시 발급·충돌 재시도·실패 시 전체 롤백', async () => {
      const replies = await Promise.all(Array.from({ length: 10 }, () => create()));
      assert.ok(replies.every(reply => reply.status === 201), JSON.stringify(replies));
      const numbers = replies.map(reply => reply.body.data.number);
      assert.equal(new Set(numbers).size, 10);
      assert.ok(numbers.every(number => /^[0-9a-f]{16}$/.test(number)));
      const service = app.get(TransactionsService);
      const generate = service.number.bind(service);
      let calls = 0;
      const mock = context.mock.method(service, 'number', () => ++calls === 1 ? numbers[0] : generate());
      try {
        const retried = await create();
        assert.equal(retried.status, 201, JSON.stringify(retried.body));
        assert.equal(calls, 2);
        assert.notEqual(retried.body.data.number, numbers[0]);
        mock.mock.mockImplementation(() => numbers[0]);
        const [before] = await db.query('SELECT COUNT(*) total FROM transactions WHERE organization_id = ?', [own.id]);
        error(await create(), 503, 'TRANSACTION_NUMBER_UNAVAILABLE');
        const [after] = await db.query('SELECT COUNT(*) total FROM transactions WHERE organization_id = ?', [own.id]);
        assert.equal(after.total, before.total);
      }
      finally { mock.mock.restore(); }
    });

    await context.test('목록 회사 격리·필터·기간·페이지·검색 이스케이프', async () => {
      const list = await request(`transactions?type=PURCHASE&status=CANCELED&partnerId=${own.partner}&from=2026-11-19&to=2026-11-19&q=%25_%3D&limit=1`, { access: own.staff });
      assert.equal(list.status, 200, JSON.stringify(list.body));
      assert.equal(list.body.data.length, 1);
      assert.ok(list.body.meta.total >= 3);
      assert.ok(list.body.data.every(row => row.organizationId === own.id && row.type === 'PURCHASE' && row.status === 'CANCELED'));
      const page = await request(`transactions?type=PURCHASE&status=CANCELED&partnerId=${own.partner}&from=2026-11-19&to=2026-11-19&q=%25_%3D&limit=1&page=2`, { access: own.staff });
      assert.notEqual(page.body.data[0].id, list.body.data[0].id);
      assert.deepEqual((await request(`transactions?partnerId=${other.partner}`, { access: own.staff })).body.data, []);
      assert.equal((await request(`transactions?q=${transaction.number}`, { access: own.staff })).body.meta.total, 1);
      const korean = await request(`transactions?q=${encodeURIComponent('공용')}`, { access: own.staff });
      assert.equal(korean.status, 200, JSON.stringify(korean.body));
      assert.ok(korean.body.meta.total > 0);
      for (const query of ['type=OTHER', 'status=ACTIVE', 'partnerId=0', 'partnerId=1.5', 'from=2026-02-30', 'from=2026-11-20&to=2026-11-19', 'limit=101', 'page=0', 'q[x]=a', 'organizationId=1']) {
        error(await request(`transactions?${query}`, { access: own.staff }), 400, 'VALIDATION_ERROR');
      }
      for (const id of ['0', 'abc', '4294967296']) error(await request(`transactions/${id}`, { access: own.staff }), 400, 'VALIDATION_ERROR');
      error(await request('transactions/4294967295', { access: own.staff }), 404, 'TRANSACTION_NOT_FOUND');
    });
  }
  finally {
    for (const { id } of companies) {
      await db.query('DELETE FROM transaction_reads WHERE organization_id = ?', [id]);
      await db.query('DELETE FROM transaction_lines WHERE organization_id = ?', [id]);
      await db.query('DELETE FROM transactions WHERE organization_id = ?', [id]);
      await db.query('DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM users WHERE organization_id = ?)', [id]);
      for (const table of ['partners', 'items', 'users', 'organizations']) {
        await db.query(`DELETE FROM ${table} WHERE ${table === 'organizations' ? 'id' : 'organization_id'} = ?`, [id]);
      }
    }
    await app.close();
  }
});
