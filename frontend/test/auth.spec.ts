import { test, expect } from '@playwright/test';
import { baseURL, createCompany, password, removeCompany, signIn } from './helpers';

test('회사 등록·자동 로그인·회사 코드·갱신·로그아웃·다중 탭', async ({ page, context }, info) => {
  const companyName = `e2e_${Date.now()}`;
  const errors: string[] = [];
  let companyId: number | undefined;
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto('/');
    await expect(page.locator('form')).toHaveCount(0);
    await page.getByRole('link', { name: '헬스체크', exact: true }).click();
    await expect(page.locator('[data-status=ok]')).toHaveCount(process.env.FASTAPI_ENABLED === 'true' ? 3 : 2);
    await page.getByRole('navigation').getByRole('link', { name: '회사 등록', exact: true }).click();
    await expect(page).toHaveURL('/start');
    await expect(page.locator('input[type=email], input[name=role]')).toHaveCount(0);
    await page.getByLabel('회사명', { exact: true }).fill(companyName);
    await page.getByLabel('아이디', { exact: true }).fill('admin');
    await page.getByLabel('비밀번호', { exact: true }).fill(password);
    await page.getByLabel('비밀번호 확인', { exact: true }).fill('different-password');
    await page.getByRole('button', { name: '회사 등록', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('비밀번호가 일치하지 않습니다.');
    await page.getByLabel('비밀번호 확인', { exact: true }).fill(password);
    const registered = page.waitForResponse(response => response.url().endsWith('/organizations/register') && response.status() === 201);
    const loggedIn = page.waitForResponse(response => response.url().endsWith('/auth/login') && response.status() === 200);
    await page.getByRole('button', { name: '회사 등록', exact: true }).click();
    const company = (await (await registered).json()).data.organization;
    companyId = company.id;
    const access = (await (await loggedIn).json()).data.accessToken;
    await expect(page).toHaveURL('/settings/company');
    await expect(page.getByRole('main')).toContainText(company.code);
    await expect(page.getByRole('main')).toContainText(companyName);
    await expect(page.getByRole('navigation', { name: '메인 메뉴' })).toContainText('admin · 관리자');
    await page.screenshot({ path: info.outputPath('company-desktop.png'), fullPage: true });
    const cookie = (await context.cookies()).find(cookie => cookie.name === 'refresh_token');
    expect(cookie?.httpOnly).toBe(true);
    expect(await page.evaluate(() => document.cookie.includes('refresh_token'))).toBe(false);
    expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
    await page.reload();
    await expect(page.getByRole('main')).toContainText(company.code);
    expect((await context.cookies()).find(cookie => cookie.name === 'refresh_token')?.value).not.toBe(cookie?.value);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('company-mobile.png'), fullPage: true });
    const second = await context.newPage();
    await Promise.all([page.goto('/health'), second.goto('/')]);
    for (const current of [page, second]) await expect(current.getByRole('navigation')).toContainText('admin · 관리자');
    await page.route('**/auth/logout', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '인증 저장소에 연결할 수 없습니다.' } }) }));
    await page.getByRole('button', { name: '로그아웃', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('인증 저장소에 연결할 수 없습니다.');
    await expect(page.getByRole('navigation')).toContainText('admin · 관리자');
    await page.unroute('**/auth/logout');
    await page.getByRole('button', { name: '로그아웃', exact: true }).click();
    for (const current of [page, second]) await expect(current.getByRole('navigation').getByRole('link', { name: '로그인', exact: true })).toBeVisible();
    expect((await context.cookies()).some(cookie => cookie.name === 'refresh_token')).toBe(false);
    expect((await context.request.get('/api/v1/auth/me', { headers: { Authorization: `Bearer ${access}` } })).status()).toBe(401);
    await second.close();
    await page.goto('/login');
    await page.getByLabel('회사 코드', { exact: true }).fill(company.code);
    await page.getByLabel('아이디', { exact: true }).fill('admin');
    await page.getByLabel('비밀번호', { exact: true }).fill('wrong-password');
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('회사 코드, 아이디 또는 비밀번호를 확인해주세요.');
    await page.getByLabel('비밀번호', { exact: true }).fill(password);
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await expect(page).toHaveURL('/');
    await page.getByRole('button', { name: '로그아웃', exact: true }).click();
    await expect(page.getByRole('navigation').getByRole('link', { name: '로그인', exact: true })).toBeVisible();
    await page.goto('/signup');
    await expect(page).toHaveURL('/start');
    expect(errors).toEqual([]);
  }
  finally { if (companyId) removeCompany(companyId); }
});

test('회사 등록 후 자동 로그인 실패 시 회사 코드와 아이디 보존', async ({ page }) => {
  await page.route('**/organizations/register', route => route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: {
    organization: { id: 1, name: '등록 회사', code: '000123' }, admin: { id: 1, username: 'signup_retry', role: 'ADMIN' },
  } }) }));
  await page.route('**/auth/login', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '인증 저장소에 연결할 수 없습니다.' } }) }));
  await page.goto('/start');
  await page.getByLabel('회사명', { exact: true }).fill('등록 회사');
  await page.getByLabel('아이디', { exact: true }).fill('signup_retry');
  await page.getByLabel('비밀번호', { exact: true }).fill(password);
  await page.getByLabel('비밀번호 확인', { exact: true }).fill(password);
  await page.getByRole('button', { name: '회사 등록', exact: true }).click();
  await expect(page).toHaveURL('/login');
  await expect(page.getByRole('alert')).toContainText('회사 등록이 완료되었습니다. 회사 코드: 000123.');
  await expect(page.getByLabel('회사 코드', { exact: true })).toHaveValue('000123');
  await expect(page.getByLabel('아이디', { exact: true })).toHaveValue('signup_retry');
  await expect(page.getByLabel('비밀번호', { exact: true })).toHaveValue('');
});

test('직원 등록·로그인·권한·비활성화·비밀번호 초기화', async ({ page, browser }, info) => {
  const company = await createCompany(page.request);
  const staffContext = await browser.newContext({ baseURL });
  const staffPage = await staffContext.newPage();
  const errors: string[] = [];
  for (const current of [page, staffPage]) current.on('pageerror', error => errors.push(error.message));
  try {
    await signIn(page, company.code);
    await page.getByRole('link', { name: '직원 관리', exact: true }).click();
    await expect(page.getByRole('heading', { name: '직원 관리', exact: true })).toBeVisible();
    await page.getByRole('link', { name: '직원 등록', exact: true }).click();
    await expect(page).toHaveURL('/settings/users/new');
    await expect(page.getByRole('table')).toHaveCount(0);
    await page.getByLabel('아이디', { exact: true }).fill('employee');
    await page.getByLabel('비밀번호', { exact: true }).fill(password);
    await page.getByLabel('비밀번호 확인', { exact: true }).fill(password);
    await page.screenshot({ path: info.outputPath('user-create-desktop.png'), fullPage: true });
    const created = page.waitForResponse(response => response.url().endsWith('/users') && response.request().method() === 'POST');
    await page.getByRole('button', { name: '등록', exact: true }).click();
    const employee = (await (await created).json()).data;
    await expect(page).toHaveURL(`/settings/users/${employee.id}`);
    await expect(page.getByLabel('아이디', { exact: true })).toHaveValue('employee');
    await page.reload();
    await expect(page.getByRole('heading', { name: '직원 상세', exact: true })).toBeVisible();
    await signIn(staffPage, company.code, 'employee');
    await expect(staffPage.getByRole('link', { name: '직원 관리', exact: true })).toHaveCount(0);
    await staffPage.goto('/settings/users');
    await expect(staffPage.getByRole('heading', { name: '접근 권한이 없습니다.' })).toBeVisible();
    await staffPage.goto('/settings/company');
    await expect(staffPage.getByRole('main')).toContainText(company.code);
    await page.getByRole('button', { name: '비활성화', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('비활성화되고');
    await staffPage.reload();
    await expect(staffPage).toHaveURL('/login');
    await page.getByRole('button', { name: '활성화', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('계정이 활성화되었습니다.');
    await signIn(staffPage, company.code, 'employee');
    await page.getByLabel('새 비밀번호', { exact: true }).fill('new-browser-password');
    await page.getByLabel('비밀번호 확인', { exact: true }).fill('new-browser-password');
    await page.getByRole('button', { name: '비밀번호 초기화', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('비밀번호가 초기화되고');
    await expect(page.getByLabel('새 비밀번호', { exact: true })).toHaveValue('');
    await staffPage.goto('/items');
    await expect(staffPage).toHaveURL('/login');
    await signIn(staffPage, company.code, 'employee', 'new-browser-password');
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('user-detail-mobile.png'), fullPage: true });
    await page.getByRole('link', { name: '목록', exact: true }).click();
    await page.getByLabel('아이디 검색', { exact: true }).fill('employee');
    await page.getByRole('button', { name: '검색', exact: true }).click();
    await expect(page.getByRole('table').getByRole('link', { name: 'admin', exact: true })).toHaveCount(0);
    await expect(page.getByRole('table').getByRole('link', { name: 'employee', exact: true })).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.screenshot({ path: info.outputPath('user-list-desktop.png'), fullPage: true });
    await page.getByRole('link', { name: '직원 관리', exact: true }).first().click();
    await page.getByRole('table').getByRole('link', { name: 'admin', exact: true }).click();
    await expect(page.getByRole('button', { name: '비활성화', exact: true })).toBeDisabled();
    expect(errors).toEqual([]);
  }
  finally { await staffContext.close(); removeCompany(company.id); }
});

test('다른 회사 로그인 시 기존 탭 인증·회사 화면 해제', async ({ page, context, request }) => {
  const first  = await createCompany(request);
  const second = await createCompany(request);
  try {
    await signIn(page, first.code);
    await page.goto('/settings/company');
    await expect(page.getByRole('main')).toContainText(first.name);
    const other = await context.newPage();
    await other.route('**/auth/refresh', route => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { code: 'REFRESH_EXPIRED' } }) }));
    await signIn(other, second.code);
    await expect(page).toHaveURL('/login');
    await expect(page.getByRole('main')).not.toContainText(first.name);
    await other.unroute('**/auth/refresh');
    await other.goto('/settings/company');
    await expect(other.getByRole('main')).toContainText(second.name);
    await other.close();
  }
  finally { removeCompany(first.id); removeCompany(second.id); }
});
