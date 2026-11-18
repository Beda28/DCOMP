import 'reflect-metadata';
import assert           from 'node:assert/strict';
import test             from 'node:test';
import { createHash }   from 'node:crypto';
import { NestFactory }  from '@nestjs/core';
import { JwtService }   from '@nestjs/jwt';
import { DataSource }   from 'typeorm';
import { AppModule }    from '../dist/app.module.js';
import { configureApp } from '../dist/app.config.js';
import { AuthService }  from '../dist/auth/auth.service.js';
import { hash }         from '../dist/auth/password.js';
import { RedisService } from '../dist/redis/redis.service.js';

if (process.env.DB_NAME !== 'dcomp_test') throw new Error('전용 dcomp_test DB에서만 실행할 수 있습니다.');

const username = 'auth_admin';
const password = 'test-admin-password-123';
const digest   = value => createHash('sha256').update(value).digest('hex');

test('인증 API와 세션 폐기', async context => {
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);
  await app.listen(0, '0.0.0.0');

  const database = app.get(DataSource);
  const auth     = app.get(AuthService);
  const jwt      = app.get(JwtService);
  const redis    = app.get(RedisService);
  const base     = await app.getUrl();
  const organizationId = (await database.query("INSERT INTO organizations (name, code) VALUES ('Auth test', '000123')")).insertId;
  const companyCode = '000123';
  const passwordHash = await hash(password);
  await database.query("INSERT INTO users (organization_id, username, password_hash, role) VALUES (?, ?, ?, 'ADMIN')", [organizationId, username, passwordHash]);
  const [user] = await database.query('SELECT id, password_hash FROM users WHERE organization_id = ?', [organizationId]);

  const request = async (path, { body, cookie, access, headers = {}, method = path === 'me' ? 'GET' : 'POST' } = {}) => {
    const response = await fetch(`${base}/api/v1/auth/${path}`, {
      method,
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...(access ? { Authorization: `Bearer ${access}` } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(path === 'login' ? { companyCode, ...body } : body) : undefined,
    });
    const text = await response.text();
    return {
      status: response.status, body: text ? JSON.parse(text) : null,
      cookie: response.headers.get('set-cookie')?.split(';')[0], headers: response.headers,
    };
  };
  const session = async () => {
    const result = await auth.login({ companyCode, username, password });
    return { cookie: `refresh_token=${result.refreshToken}`, access: result.data.accessToken };
  };
  const expectError = (response, status, code) => {
    assert.equal(response.status, status);
    assert.equal(response.body.error.code, code);
    assert.equal(typeof response.body.requestId, 'string');
  };

  try {
    await context.test('입력 검증, CSRF 차단, 잘못된 자격 증명', async () => {
      expectError(await request('login', { body: { username: 'bad@id', password } }), 400, 'VALIDATION_ERROR');
      expectError(await request('login', { body: { username, password, role: 'ADMIN' } }), 400, 'VALIDATION_ERROR');
      expectError(await request('login', { body: { username, password }, headers: { Origin: 'https://other.example.com' } }), 403, 'FORBIDDEN');
      expectError(await request('login', { body: { username, password }, headers: { 'X-Requested-With': '' } }), 403, 'FORBIDDEN');
      expectError(await request('login', { body: { username, password: 'wrong' } }), 401, 'INVALID_CREDENTIALS');
      expectError(await request('login', { body: { username: 'missing', password } }), 401, 'INVALID_CREDENTIALS');
      expectError(await request('me'), 401, 'UNAUTHORIZED');
    });

    await context.test('공개 직원 가입 제거와 회사 코드 필수 입력', async () => {
      assert.equal((await request('signup', { body: { username, password } })).status, 404);
      expectError(await request('login', { body: { companyCode: undefined, username, password } }), 400, 'VALIDATION_ERROR');
      expectError(await request('login', { body: { companyCode: '999999', username, password } }), 401, 'INVALID_CREDENTIALS');
    });

    let initial;
    await context.test('관리자 로그인, JWT 15분, HttpOnly 쿠키 7일, 해시만 저장', async () => {
      initial = await request('login', { body: { username: username.toUpperCase(), password } });
      assert.equal(initial.status, 200);
      assert.deepEqual(initial.body.data.user, { id: user.id, organizationId, username, role: 'ADMIN' });
      assert.equal(initial.body.data.expiresIn, 900);
      assert.equal(initial.headers.get('cache-control'), 'no-store');
      const cookie = initial.headers.get('set-cookie');
      assert.match(cookie, /HttpOnly/);
      assert.match(cookie, /SameSite=Lax/);
      assert.match(cookie, /Path=\/api\/v1\/auth/);
      assert.match(cookie, /Max-Age=604800/);
      assert.doesNotMatch(cookie, /; Secure/);
      assert.notEqual(user.password_hash, password);

      const claims = jwt.decode(initial.body.data.accessToken);
      assert.equal(claims.exp - claims.iat, 900);
      const raw = initial.cookie.split('=')[1];
      const [row] = await database.query('SELECT refresh_token_hash FROM auth_sessions WHERE family_id = ?', [claims.sid]);
      assert.equal(row.refresh_token_hash, digest(raw));
      assert.notEqual(row.refresh_token_hash, raw);
      const me = await request('me', { access: initial.body.data.accessToken });
      assert.equal(me.status, 200);
      assert.deepEqual(me.body.data, { id: user.id, organizationId, username, role: 'ADMIN', status: 'ACTIVE' });
    });

    await context.test('직원 권한과 비활성 계정 차단', async () => {
      await database.query("UPDATE users SET role = 'STAFF' WHERE id = ?", [user.id]);
      const staff = await request('login', { body: { username, password } });
      assert.equal(staff.body.data.user.role, 'STAFF');
      assert.equal((await request('me', { access: staff.body.data.accessToken })).body.data.role, 'STAFF');

      await database.query("UPDATE users SET status = 'DISABLED' WHERE id = ?", [user.id]);
      expectError(await request('login', { body: { username, password } }), 401, 'INVALID_CREDENTIALS');
      expectError(await request('me', { access: staff.body.data.accessToken }), 401, 'UNAUTHORIZED');
      expectError(await request('refresh', { cookie: staff.cookie }), 401, 'SESSION_REVOKED');
      await database.query("UPDATE users SET status = 'ACTIVE', role = 'ADMIN' WHERE id = ?", [user.id]);
      expectError(await request('me', { access: staff.body.data.accessToken }), 401, 'UNAUTHORIZED');
    });

    await context.test('Refresh 회전과 재사용 시 해당 세션 계열만 폐기', async () => {
      const other = await session();
      const next  = await request('refresh', { cookie: initial.cookie });
      assert.equal(next.status, 200);
      assert.notEqual(next.cookie, initial.cookie);
      assert.deepEqual(Object.keys(next.body.data).sort(), ['accessToken', 'expiresIn']);
      expectError(await request('refresh', { cookie: initial.cookie }), 401, 'SESSION_REVOKED');
      expectError(await request('refresh', { cookie: next.cookie }), 401, 'SESSION_REVOKED');
      expectError(await request('me', { access: next.body.data.accessToken }), 401, 'UNAUTHORIZED');
      assert.equal((await request('me', other)).status, 200);
    });

    await context.test('동일 Refresh 동시 요청에도 재사용된 세션 전체 폐기', async () => {
      const current = await session();
      const replies = await Promise.all([request('refresh', current), request('refresh', current)]);
      assert.deepEqual(replies.map(reply => reply.status).sort(), [200, 401]);
      const winner = replies.find(reply => reply.status === 200);
      expectError(await request('refresh', { cookie: winner.cookie }), 401, 'SESSION_REVOKED');
      expectError(await request('me', { access: winner.body.data.accessToken }), 401, 'UNAUTHORIZED');
    });

    await context.test('Refresh 만료·누락과 JWT 위변조·만료 차단', async () => {
      const current = await session();
      const claims  = jwt.decode(current.access);
      await database.query('UPDATE auth_sessions SET expires_at = ? WHERE family_id = ?', [new Date(Date.now() - 1000), claims.sid]);
      expectError(await request('refresh', current), 401, 'REFRESH_EXPIRED');
      const missing = await request('refresh');
      expectError(missing, 401, 'REFRESH_EXPIRED');
      assert.match(missing.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/);
      expectError(await request('me', { access: `${current.access.slice(0, -5)}wrong` }), 401, 'UNAUTHORIZED');
      const expired = await jwt.signAsync({ sub: String(user.id), sid: claims.sid, jti: claims.jti, type: 'access' }, { expiresIn: -1 });
      expectError(await request('me', { access: expired }), 401, 'UNAUTHORIZED');
    });

    await context.test('로그아웃 204, 쿠키 삭제, Access 거부 목록과 Refresh 폐기', async () => {
      const current = await session();
      const reply   = await request('logout', current);
      assert.equal(reply.status, 204);
      assert.equal(reply.body, null);
      assert.match(reply.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/);
      assert.equal(await redis.accessDenied(jwt.decode(current.access).jti), true);
      expectError(await request('me', current), 401, 'UNAUTHORIZED');
      expectError(await request('refresh', current), 401, 'SESSION_REVOKED');
      expectError(await request('logout', current), 401, 'SESSION_REVOKED');

      const cookieOnly = await session();
      assert.equal((await request('logout', { cookie: cookieOnly.cookie })).status, 204);
      expectError(await request('me', cookieOnly), 401, 'UNAUTHORIZED');
    });

    await context.test('HTTPS 설정 시 Secure 쿠키와 로그인 횟수 제한', async () => {
      process.env.COOKIE_SECURE = 'true';
      const reply = await request('login', { body: { username, password } });
      assert.equal(reply.status, 200);
      assert.match(reply.headers.get('set-cookie'), /; Secure/);
      process.env.COOKIE_SECURE = 'false';
      let limited;
      for (let index = 0; index < 10; index++) {
        limited = await request('login', { body: {} });
        if (limited.status === 429) break;
      }
      assert.equal(limited.status, 429);
    });

    await context.test('Redis 장애 시 인증 503, 로그아웃 실패 시 쿠키와 세션 보존', async () => {
      const current = await session();
      redis.onApplicationShutdown();
      expectError(await request('me', current), 503, 'AUTH_STORE_UNAVAILABLE');
      const reply = await request('logout', current);
      expectError(reply, 503, 'AUTH_STORE_UNAVAILABLE');
      assert.equal(reply.headers.get('set-cookie'), null);
      const [row] = await database.query('SELECT revoked_at FROM auth_sessions WHERE refresh_token_hash = ?', [digest(current.cookie.split('=')[1])]);
      assert.equal(row.revoked_at, null);
    });
  }
  finally {
    await database.query('DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM users WHERE organization_id = ?)', [organizationId]);
    await database.query('DELETE FROM users WHERE organization_id = ?', [organizationId]);
    await database.query('DELETE FROM organizations WHERE id = ?', [organizationId]);
    await app.close();
  }
});
