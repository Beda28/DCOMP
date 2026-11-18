import 'reflect-metadata';
import crypto                    from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import assert                    from 'node:assert/strict';
import test                      from 'node:test';
import { NestFactory }           from '@nestjs/core';
import { DataSource }            from 'typeorm';
import { AppModule }             from '../dist/app.module.js';
import { configureApp }          from '../dist/app.config.js';
import { AuthService }           from '../dist/auth/auth.service.js';

if (process.env.DB_NAME !== 'dcomp_test') throw new Error('전용 dcomp_test DB에서만 실행할 수 있습니다.');

test('회사 등록·직원 관리·회사별 접근 제한', async context => {
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);
  await app.listen(0, '0.0.0.0');
  const db       = app.get(DataSource);
  const auth     = app.get(AuthService);
  const base     = await app.getUrl();
  const password = 'organization-test-password';
  const companies = [];
  let first;
  let second;
  let admin;
  let otherAdmin;
  let staff;
  let employee;

  const request = async (path, { method = 'GET', body, access, cookie } = {}) => {
    const response = await fetch(`${base}/api/v1/${path}`, {
      method,
      headers: {
        'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json',
        ...(access ? { Authorization: `Bearer ${access}` } : {}), ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };
  const error = (reply, status, code) => {
    assert.equal(reply.status, status, JSON.stringify(reply.body));
    assert.equal(reply.body.error.code, code);
  };
  const login = async (company, username = 'admin', secret = password) => {
    const result = await auth.login({ companyCode: company.organization.code, username, password: secret });
    return { access: result.data.accessToken, cookie: `refresh_token=${result.refreshToken}` };
  };

  try {
    await context.test('회사와 최초 관리자 원자적 등록, 회사별 동일 아이디 허용', async () => {
      for (const body of [
        { companyName: ' ', username: 'admin', password },
        { companyName: '회사', username: 'admin', password: 'short' },
        { companyName: '회사', username: 'admin', password, organizationId: 1 },
        { companyName: '회사', username: 'admin', password, role: 'STAFF' },
      ]) error(await request('organizations/register', { method: 'POST', body }), 400, 'VALIDATION_ERROR');
      const replies = await Promise.all(['회사 A', '회사 B'].map(companyName => request('organizations/register', {
        method: 'POST', body: { companyName, username: 'Admin', password },
      })));
      for (const reply of replies) {
        assert.equal(reply.status, 201, JSON.stringify(reply.body));
        const data = reply.body.data;
        companies.push(data.organization.id);
        assert.match(data.organization.code, /^\d{6}$/);
        assert.equal(data.admin.username, 'admin');
        assert.equal(data.admin.role, 'ADMIN');
        assert.deepEqual(Object.keys(data.admin).sort(), ['id', 'role', 'username']);
        const [row] = await db.query('SELECT organization_id, role, password_hash FROM users WHERE id = ?', [data.admin.id]);
        assert.equal(row.organization_id, data.organization.id);
        assert.equal(row.role, 'ADMIN');
        assert.notEqual(row.password_hash, password);
      }
      [first, second] = replies.map(reply => reply.body.data);
      assert.notEqual(first.organization.code, second.organization.code);
      admin = await login(first);
      otherAdmin = await login(second);
      assert.deepEqual((await request('organizations/me', admin)).body.data, { ...first.organization, status: 'ACTIVE' });
      assert.equal((await request('auth/me', admin)).body.data.organizationId, first.organization.id);
    });

    await context.test('관리자 생성 실패 시 회사 등록도 롤백', async () => {
      const [{ total: before }] = await db.query('SELECT COUNT(*) AS total FROM organizations');
      await db.query("ALTER TABLE users ADD CONSTRAINT reject_test_admin CHECK (username <> 'rollback_admin')");
      try {
        error(await request('organizations/register', { method: 'POST', body: { companyName: '롤백', username: 'rollback_admin', password } }), 503, 'STORE_UNAVAILABLE');
      }
      finally { await db.query('ALTER TABLE users DROP CHECK reject_test_admin'); }
      const [{ total: after }] = await db.query('SELECT COUNT(*) AS total FROM organizations');
      assert.equal(after, before);
    });

    await context.test('회사 코드 충돌 재발급과 반복 충돌 종료', async () => {
      const rows = await db.query('SELECT code FROM organizations');
      const codes = new Set(rows.map(row => row.code));
      let available = 0;
      while (codes.has(String(available).padStart(6, '0'))) available++;
      let calls = 0;
      let generate = context.mock.method(crypto, 'randomInt', () => calls++ === 0 ? Number(first.organization.code) : available);
      syncBuiltinESMExports();
      try {
        const reply = await request('organizations/register', { method: 'POST', body: { companyName: '재발급', username: 'admin', password } });
        assert.equal(reply.status, 201, JSON.stringify(reply.body));
        companies.push(reply.body.data.organization.id);
        assert.equal(reply.body.data.organization.code, String(available).padStart(6, '0'));
        assert.equal(calls, 2);
      }
      finally { generate.mock.restore(); syncBuiltinESMExports(); }
      const [{ total: before }] = await db.query('SELECT COUNT(*) AS total FROM organizations');
      generate = context.mock.method(crypto, 'randomInt', () => Number(first.organization.code));
      syncBuiltinESMExports();
      try {
        error(await request('organizations/register', { method: 'POST', body: { companyName: '충돌', username: 'admin', password } }), 409, 'CODE_COLLISION_RETRY_EXHAUSTED');
        assert.equal(generate.mock.callCount(), 10);
      }
      finally { generate.mock.restore(); syncBuiltinESMExports(); }
      const [{ total: after }] = await db.query('SELECT COUNT(*) AS total FROM organizations');
      assert.equal(after, before);
    });

    await context.test('직원 생성·중복·동시 생성·권한 주입 차단', async () => {
      const created = await request('users', { method: 'POST', ...admin, body: { username: 'Employee', password } });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      employee = created.body.data;
      assert.deepEqual(employee, { id: employee.id, username: 'employee', role: 'STAFF', status: 'ACTIVE' });
      staff = await login(first, 'employee');
      error(await request('users', staff), 403, 'FORBIDDEN');
      error(await request('users', { method: 'POST', ...staff, body: { username: 'illegal', password } }), 403, 'FORBIDDEN');
      for (const field of [{ role: 'ADMIN' }, { organizationId: second.organization.id }, { status: 'DISABLED' }]) {
        error(await request('users', { method: 'POST', ...admin, body: { username: 'illegal', password, ...field } }), 400, 'VALIDATION_ERROR');
      }
      error(await request('users', { method: 'POST', ...admin, body: { username: 'EMPLOYEE', password } }), 409, 'USERNAME_TAKEN');
      assert.equal((await request('users', { method: 'POST', ...otherAdmin, body: { username: 'employee', password } })).status, 201);
      const replies = await Promise.all(['race', 'RACE'].map(username => request('users', { method: 'POST', ...admin, body: { username, password } })));
      assert.deepEqual(replies.map(reply => reply.status).sort(), [201, 409]);
      const list = await request('users?q=employee&status=ACTIVE&page=1&limit=1', admin);
      assert.deepEqual(list.body, { data: [employee], meta: { page: 1, limit: 1, total: 1 } });
      for (const query of ['status=INACTIVE', 'limit=101', 'page=0', 'organizationId=1']) error(await request(`users?${query}`, admin), 400, 'VALIDATION_ERROR');
    });

    await context.test('타 회사 직원 조회·상태 변경·비밀번호 초기화는 404', async () => {
      for (const [method, suffix, body] of [['GET', '', undefined], ['PATCH', '', { status: 'DISABLED' }], ['POST', '/reset-password', { newPassword: 'changed-password' }]]) {
        error(await request(`users/${employee.id}${suffix}`, { method, ...otherAdmin, body }), 404, 'USER_NOT_FOUND');
        error(await request(`users/${employee.id}${suffix}`, { method, ...staff, body }), 403, 'FORBIDDEN');
      }
      error(await request(`users/${first.admin.id}`, { method: 'PATCH', ...admin, body: { status: 'DISABLED' } }), 403, 'FORBIDDEN');
    });

    await context.test('비활성화 즉시 Access·Refresh 차단, 재활성화 시 옛 세션 복구 금지', async () => {
      const fresh = await login(first, 'employee');
      assert.equal((await request(`users/${employee.id}`, { method: 'PATCH', ...admin, body: { status: 'DISABLED' } })).status, 200);
      error(await request('auth/me', staff), 401, 'UNAUTHORIZED');
      error(await request('auth/refresh', { method: 'POST', cookie: fresh.cookie }), 401, 'SESSION_REVOKED');
      error(await request('auth/login', { method: 'POST', body: { companyCode: first.organization.code, username: 'employee', password } }), 401, 'INVALID_CREDENTIALS');
      assert.equal((await request(`users/${employee.id}`, { method: 'PATCH', ...admin, body: { status: 'ACTIVE' } })).status, 200);
      error(await request('auth/me', staff), 401, 'UNAUTHORIZED');
      staff = await login(first, 'employee');
      assert.equal((await request('auth/me', staff)).status, 200);
    });

    await context.test('비밀번호 초기화와 Refresh 경합 후 모든 기존 세션 폐기', async () => {
      const fresh = await login(first, 'employee');
      error(await request(`users/${employee.id}/reset-password`, { method: 'POST', ...admin, body: { newPassword: 'short' } }), 400, 'VALIDATION_ERROR');
      const [reset, refresh] = await Promise.all([
        request(`users/${employee.id}/reset-password`, { method: 'POST', ...admin, body: { newPassword: 'changed-password' } }),
        request('auth/refresh', { method: 'POST', cookie: fresh.cookie }),
      ]);
      assert.equal(reset.status, 204);
      assert.ok([200, 401].includes(refresh.status), JSON.stringify(refresh.body));
      if (refresh.status === 200) error(await request('auth/me', { access: refresh.body.data.accessToken }), 401, 'UNAUTHORIZED');
      for (const session of [staff, fresh]) {
        error(await request('auth/me', session), 401, 'UNAUTHORIZED');
        error(await request('auth/refresh', { method: 'POST', cookie: session.cookie }), 401, 'SESSION_REVOKED');
      }
      error(await request('auth/login', { method: 'POST', body: { companyCode: first.organization.code, username: 'employee', password } }), 401, 'INVALID_CREDENTIALS');
      staff = await login(first, 'employee', 'changed-password');
      assert.equal((await request('auth/me', staff)).status, 200);
      assert.equal((await request('auth/me', admin)).status, 200);
    });

    await context.test('거래처·품목 회사별 목록과 직접 ID 접근, 회사별 중복 허용', async () => {
      for (const [path, body, code] of [
        ['partners', { name: '공통 거래처', roles: ['CUSTOMER'], bizNumber: '5556677777' }, 'PARTNER_NOT_FOUND'],
        ['items', { name: '공통 품목', sku: 'COMMON' }, 'ITEM_NOT_FOUND'],
      ]) {
        const own = await request(path, { method: 'POST', ...admin, body });
        const foreign = await request(path, { method: 'POST', ...otherAdmin, body });
        assert.equal(own.status, 201);
        assert.equal(foreign.status, 201);
        const id = own.body.data.id;
        for (const session of [otherAdmin, { ...(await login(second, 'employee')) }]) {
          for (const method of ['GET', 'PATCH', 'DELETE']) error(await request(`${path}/${id}`, { method, ...session, body: method === 'PATCH' ? { name: '침범' } : undefined }), 404, code);
        }
        const list = await request(path, otherAdmin);
        assert.deepEqual(list.body.data.map(row => row.id), [foreign.body.data.id]);
        error(await request(path, { method: 'POST', ...admin, body: { ...body, organizationId: second.organization.id } }), 400, 'VALIDATION_ERROR');
        error(await request(`${path}/${id}`, { method: 'PATCH', ...admin, body: { organizationId: second.organization.id } }), 400, 'VALIDATION_ERROR');
        error(await request(`${path}?organizationId=${second.organization.id}`, admin), 400, 'VALIDATION_ERROR');
        error(await request(`${path}/${id}`, { method: 'DELETE', ...staff }), 403, 'FORBIDDEN');
        if (path === 'items') error(await request(`${path}/${id}`, { method: 'PATCH', ...staff, body: { name: '직원 수정' } }), 403, 'FORBIDDEN');
      }
    });

    await context.test('관리자 간 동시 비활성화에도 활성 관리자 유지', async () => {
      const [rival] = await db.query("SELECT id FROM users WHERE organization_id = ? AND username = 'race'", [first.organization.id]);
      await db.query("UPDATE users SET role = 'ADMIN' WHERE id = ?", [rival.id]);
      const rivalSession = await login(first, 'race');
      const replies = await Promise.all([
        request(`users/${rival.id}`, { method: 'PATCH', ...admin, body: { status: 'DISABLED' } }),
        request(`users/${first.admin.id}`, { method: 'PATCH', ...rivalSession, body: { status: 'DISABLED' } }),
      ]);
      assert.equal(replies.filter(reply => reply.status === 200).length, 1);
      assert.ok(replies.some(reply => [401, 403].includes(reply.status)), JSON.stringify(replies));
      const active = await db.query("SELECT id FROM users WHERE organization_id = ? AND role = 'ADMIN' AND status = 'ACTIVE'", [first.organization.id]);
      assert.equal(active.length, 1);
      if (active[0].id === rival.id) admin = rivalSession;
    });

    await context.test('회사 비활성화 시 로그인·Access·Refresh 차단', async () => {
      await db.query("UPDATE organizations SET status = 'DISABLED' WHERE id = ?", [first.organization.id]);
      error(await request('auth/login', { method: 'POST', body: { companyCode: first.organization.code, username: 'admin', password } }), 401, 'INVALID_CREDENTIALS');
      error(await request('auth/me', admin), 401, 'UNAUTHORIZED');
      error(await request('organizations/me', admin), 401, 'UNAUTHORIZED');
      error(await request('auth/refresh', { method: 'POST', cookie: admin.cookie }), 401, 'SESSION_REVOKED');
      assert.equal((await request('auth/me', otherAdmin)).status, 200);
    });

    await context.test('공개 회사 등록 요청 제한', async () => {
      let reply;
      for (let attempt = 0; attempt < 10; attempt++) {
        reply = await request('organizations/register', { method: 'POST', body: {} });
        if (reply.status === 429) break;
      }
      assert.equal(reply.status, 429);
    });
  }
  finally {
    for (const id of companies) {
      await db.query('DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM users WHERE organization_id = ?)', [id]);
      for (const table of ['partners', 'items', 'users']) await db.query(`DELETE FROM ${table} WHERE organization_id = ?`, [id]);
      await db.query('DELETE FROM organizations WHERE id = ?', [id]);
    }
    await app.close();
  }
});
