import { test, expect }  from '@playwright/test';
import { readFileSync }  from 'node:fs';
import { execFileSync }  from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const env  = Object.fromEntries(readFileSync(new URL('../../.env', import.meta.url), 'utf8').split(/\r?\n/)
  .filter(line => line.includes('=') && !line.startsWith('#'))
  .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));

test('아이디 가입·로그인·공통 헤더·헬스체크·갱신·로그아웃', async ({ page, context }) => {
  const username = `e2e_${Date.now()}`;
  const password = 'browser-test-password-123';
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));

  try {
    await page.goto('/');
    await expect(page.getByRole('navigation').getByRole('link', { name: '로그인', exact: true })).toBeVisible();
    await expect(page.locator('[data-status]')).toHaveCount(0);
    await expect(page.locator('form')).toHaveCount(0);
    await page.getByRole('link', { name: '헬스체크', exact: true }).click();
    await expect(page).toHaveURL('/health');
    await expect(page.locator('[data-status=ok]')).toHaveCount(3);
    await page.reload();
    await expect(page.locator('[data-status=ok]')).toHaveCount(3);
    await page.getByRole('navigation').getByRole('link', { name: '회원가입', exact: true }).click();

    await expect(page).toHaveURL('/signup');
    await expect(page.locator('input[type=email]')).toHaveCount(0);
    await expect(page.locator('select, input[name=role]')).toHaveCount(0);
    await page.getByLabel('아이디', { exact: true }).fill(username);
    await page.getByLabel('비밀번호', { exact: true }).fill(password);
    await page.getByLabel('비밀번호 확인', { exact: true }).fill('different-password');
    await page.getByRole('button', { name: '회원가입', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('비밀번호가 일치하지 않습니다.');
    await page.getByLabel('비밀번호 확인', { exact: true }).fill(password);
    const loginResponse = page.waitForResponse(response => response.url().endsWith('/auth/login') && response.status() === 200);
    await page.getByRole('button', { name: '회원가입', exact: true }).click();
    const access = (await (await loginResponse).json()).data.accessToken;
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('navigation')).toContainText(`${username} · 직원`);
    await expect(page.getByRole('navigation').getByRole('link', { name: '로그인', exact: true })).toHaveCount(0);
    await expect(page.getByRole('main')).toContainText(`${username}님, 환영합니다.`);

    const cookie = (await context.cookies()).find(cookie => cookie.name === 'refresh_token');
    expect(cookie?.httpOnly).toBe(true);
    expect(await page.evaluate(() => document.cookie.includes('refresh_token'))).toBe(false);
    expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
    await page.reload();
    await expect(page.getByRole('navigation')).toContainText(`${username} · 직원`);
    expect((await context.cookies()).find(cookie => cookie.name === 'refresh_token')?.value).not.toBe(cookie?.value);

    for (const path of ['/login', '/signup']) {
      await page.goto(path);
      await expect(page).toHaveURL('/');
      await expect(page.getByRole('button', { name: '로그아웃', exact: true })).toBeVisible();
    }

    const second = await context.newPage();
    await Promise.all([page.goto('/health'), second.goto('/')]);
    await expect(page.getByRole('navigation')).toContainText(`${username} · 직원`);
    await expect(second.getByRole('navigation')).toContainText(`${username} · 직원`);
    await page.route('**/auth/logout', route => route.fulfill({
      status: 503, contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'AUTH_STORE_UNAVAILABLE', message: '인증 저장소에 연결할 수 없습니다.' } }),
    }));
    await page.getByRole('button', { name: '로그아웃', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('인증 저장소에 연결할 수 없습니다.');
    await expect(page.getByRole('navigation')).toContainText(username);
    expect((await context.cookies()).some(cookie => cookie.name === 'refresh_token')).toBe(true);
    await page.unroute('**/auth/logout');
    await page.getByRole('button', { name: '로그아웃', exact: true }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('navigation').getByRole('link', { name: '로그인', exact: true })).toBeVisible();
    await expect(second.getByRole('navigation').getByRole('link', { name: '로그인', exact: true })).toBeVisible();
    await expect(page.getByRole('main')).not.toContainText(username);
    expect((await context.cookies()).some(cookie => cookie.name === 'refresh_token')).toBe(false);
    expect((await context.request.get('/api/v1/auth/me', { headers: { Authorization: `Bearer ${access}` } })).status()).toBe(401);
    await page.goBack();
    await expect(page.getByRole('button', { name: '로그아웃', exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('navigation').getByRole('link', { name: '로그인', exact: true })).toBeVisible();
    await second.close();

    await page.goto('/signup');
    await page.getByLabel('아이디', { exact: true }).fill(username);
    await page.getByLabel('비밀번호', { exact: true }).fill(password);
    await page.getByLabel('비밀번호 확인', { exact: true }).fill(password);
    await page.getByRole('button', { name: '회원가입', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('이미 사용 중인 아이디입니다.');

    await page.goto('/login');
    await page.getByLabel('아이디', { exact: true }).fill(username);
    await page.getByLabel('비밀번호', { exact: true }).fill('wrong-password');
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('아이디 또는 비밀번호를 확인해주세요.');
    await page.getByLabel('비밀번호', { exact: true }).fill(password);
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('navigation')).toContainText(`${username} · 직원`);
    await page.getByRole('button', { name: '로그아웃', exact: true }).click();
    await expect(page.getByRole('navigation').getByRole('link', { name: '로그인', exact: true })).toBeVisible();

    await page.goto('/login');
    await page.getByLabel('아이디', { exact: true }).fill(env.ADMIN_USERNAME);
    await page.getByLabel('비밀번호', { exact: true }).fill(env.ADMIN_PASSWORD);
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('navigation')).toContainText(`${env.ADMIN_USERNAME} · 관리자`);
    await page.getByRole('button', { name: '로그아웃', exact: true }).click();
    await expect(page.getByRole('navigation').getByRole('link', { name: '로그인', exact: true })).toBeVisible();

    for (const path of ['/', '/login', '/signup', '/health']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.setViewportSize({ width: 390, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    expect(errors).toEqual([]);
  }
  finally {
    execFileSync('docker', ['compose', 'exec', '-T', 'backend', 'node', '--input-type=module'], {
      cwd: root,
      input: `
        import { DataSource } from 'typeorm';
        import { databaseOptions } from './dist/database/database.config.js';
        const db = await new DataSource(databaseOptions).initialize();
        try {
          const [user] = await db.query('SELECT id FROM users WHERE username = ? AND role = ?', [${JSON.stringify(username)}, 'STAFF']);
          if (user) {
            await db.query('DELETE FROM auth_sessions WHERE user_id = ?', [user.id]);
            await db.query('DELETE FROM users WHERE id = ?', [user.id]);
          }
        }
        finally { await db.destroy(); }
      `,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  }
});

test('회원가입 후 자동 로그인 실패 시 로그인 화면에서 재시도', async ({ page }) => {
  await page.route('**/auth/signup', route => route.fulfill({
    status: 201, contentType: 'application/json',
    body: JSON.stringify({ data: { id: 1, username: 'signup_retry', role: 'STAFF' } }),
  }));
  await page.route('**/auth/login', route => route.fulfill({
    status: 503, contentType: 'application/json',
    body: JSON.stringify({ error: { message: '인증 저장소에 연결할 수 없습니다.' } }),
  }));
  await page.goto('/signup');
  await page.getByLabel('아이디', { exact: true }).fill('signup_retry');
  await page.getByLabel('비밀번호', { exact: true }).fill('browser-test-password');
  await page.getByLabel('비밀번호 확인', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: '회원가입', exact: true }).click();
  await expect(page).toHaveURL('/login');
  await expect(page.getByRole('alert')).toContainText('회원가입은 완료되었습니다. 로그인을 다시 시도해주세요.');
  await expect(page.getByLabel('아이디', { exact: true })).toHaveValue('signup_retry');
  await expect(page.getByLabel('비밀번호', { exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: '로그인', exact: true })).toBeEnabled();
});
