import { test, expect, type Page } from '@playwright/test';
import { baseURL, createCompany, headers, removeCompany, signIn } from './helpers';

test('거래처·품목 등록·수정·비활성화와 직원 권한, 새로고침·오류 복구', async ({ page, browser }, info) => {
  test.setTimeout(120000);
  const prefix   = `catalog_e2e_${Date.now()}`;
  const username = `ce_${Date.now()}`;
  const password = 'catalog-browser-password-123';
  const business = String(Date.now()).slice(-10);
  const formattedBusiness = business.replace(/^(\d{3})(\d{2})(\d{5})$/, '$1-$2-$3');
  const errors: string[] = [];
  const partnerIds: number[] = [];
  const itemIds: number[] = [];
  const staffContext = await browser.newContext();
  const staffPage = await staffContext.newPage();
  for (const current of [page, staffPage]) current.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());

  const trackCreate = async (path: string, action: () => Promise<void>): Promise<void> => {
    const response = page.waitForResponse(reply => reply.url().endsWith(`/api/v1/${path}`) && reply.request().method() === 'POST');
    await action();
    const reply = await response;
    expect(reply.status()).toBe(201);
    (path === 'partners' ? partnerIds : itemIds).push((await reply.json()).data.id);
    await expect(page.getByText('저장했습니다.', { exact: true })).toBeVisible();
  };
  const search = async (current: Page, text: string): Promise<void> => {
    await current.getByLabel('검색', { exact: true }).fill(text);
    const response = current.waitForResponse(reply => reply.request().method() === 'GET' && reply.url().includes('q=') && reply.status() === 200);
    await current.getByRole('button', { name: '검색', exact: true }).click();
    await response;
    await expect(current.getByText('목록 불러오는 중...')).toHaveCount(0);
  };

  const company = await createCompany(page.request);
  try {
    await page.goto('/partners');
    await expect(page).toHaveURL('/login');
    await page.goto('/items');
    await expect(page).toHaveURL('/login');
    const adminToken = await signIn(page, company.code);
    await page.getByRole('navigation', { name: '메인 메뉴' }).getByRole('link', { name: '거래처', exact: true }).click();
    await expect(page.getByRole('heading', { name: '거래처', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '거래처 등록', exact: true }).click();
    await expect(page).toHaveURL('/partners/new');
    await expect(page.getByRole('table')).toHaveCount(0);
    await page.getByLabel('거래처명', { exact: true }).fill(`${prefix}_거래처`);
    await page.getByLabel('공급사', { exact: true }).check();
    await page.getByLabel('사업자등록번호', { exact: true }).fill(business);
    await page.getByLabel('연락처', { exact: true }).fill('021234567');
    await page.getByLabel('이메일', { exact: true }).fill('sales@example.com');
    await expect(page.getByLabel('사업자등록번호', { exact: true })).toHaveValue(formattedBusiness);
    await expect(page.getByLabel('연락처', { exact: true })).toHaveValue('02-123-4567');
    await page.screenshot({ path: info.outputPath('partner-form-desktop.png'), fullPage: true });
    await trackCreate('partners', () => page.getByRole('button', { name: '저장', exact: true }).click());
    await search(page, prefix);
    const controls = await Promise.all([
      page.getByLabel('검색', { exact: true }).boundingBox(),
      page.getByRole('combobox', { name: '상태', exact: true }).boundingBox(),
      page.getByRole('button', { name: '검색', exact: true }).boundingBox(),
    ]);
    for (const control of controls) {
      expect(control?.height).toBe(42);
      expect(Math.abs(control!.y - controls[0]!.y)).toBeLessThan(1);
    }
    await page.screenshot({ path: info.outputPath('partner-list-desktop.png'), fullPage: true });
    await page.getByRole('link', { name: `${prefix}_거래처`, exact: true }).click();
    expect(new URL(page.url()).pathname).toBe(`/partners/${partnerIds[0]}`);
    await page.reload();
    await expect(page.getByLabel('이메일', { exact: true })).toHaveValue('sales@example.com');
    await expect(page.getByLabel('사업자등록번호', { exact: true })).toHaveValue(formattedBusiness);
    await page.getByLabel('연락처', { exact: true }).fill('');
    await page.getByLabel('고객사', { exact: true }).uncheck();
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await expect(page.getByText('저장했습니다.', { exact: true })).toBeVisible();
    await expect(page.getByLabel('검색', { exact: true })).toHaveValue(prefix);
    await page.getByRole('combobox', { name: '거래처 역할', exact: true }).selectOption('CUSTOMER');
    await search(page, prefix);
    await expect(page.getByText('조회 결과가 없습니다.')).toBeVisible();
    await page.getByRole('combobox', { name: '거래처 역할', exact: true }).selectOption('SUPPLIER');
    await search(page, prefix);
    await expect(page.getByRole('link', { name: `${prefix}_거래처`, exact: true })).toBeVisible();

    await page.getByRole('navigation', { name: '메인 메뉴' }).getByRole('link', { name: '품목', exact: true }).click();
    await page.getByRole('button', { name: '품목 등록', exact: true }).click();
    await expect(page).toHaveURL('/items/new');
    await page.getByLabel('SKU', { exact: true }).fill(prefix);
    await page.getByLabel('품목명', { exact: true }).fill(`${prefix}_품목`);
    await expect(page.getByLabel('단위', { exact: true })).toHaveValue('EA');
    await page.getByLabel('매입 기준가', { exact: true }).fill('0.001');
    await page.getByLabel('매입 기준가', { exact: true }).press('Tab');
    expect(await page.getByLabel('매입 기준가', { exact: true }).evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(false);
    await page.getByLabel('매입 기준가', { exact: true }).fill('0001250.5');
    await page.getByLabel('매입 기준가', { exact: true }).press('Tab');
    await expect(page.getByLabel('매입 기준가', { exact: true })).toHaveValue('1,250.50');
    await page.getByLabel('매입 기준가', { exact: true }).fill('0.01');
    await page.getByLabel('매출 기준가', { exact: true }).fill('9999999999999.99');
    await page.getByLabel('매출 기준가', { exact: true }).press('Tab');
    await expect(page.getByLabel('매출 기준가', { exact: true })).toHaveValue('9,999,999,999,999.99');
    await page.screenshot({ path: info.outputPath('item-form-desktop.png'), fullPage: true });
    await page.getByLabel('매출 기준가', { exact: true }).fill('9999999999999.99');
    await trackCreate('items', () => page.getByLabel('매출 기준가', { exact: true }).press('Enter'));
    await search(page, prefix);
    const itemButton = page.getByRole('link', { name: `${prefix}_품목`, exact: true });
    await itemButton.click();
    await expect(page.getByLabel('매출 기준가', { exact: true })).toHaveValue('9,999,999,999,999.99');
    await page.getByLabel('매입 기준가', { exact: true }).fill('');
    await page.getByLabel('매출 기준가', { exact: true }).fill('0');
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await expect(page.getByText('저장했습니다.', { exact: true })).toBeVisible();
    await itemButton.click();
    await expect(page.getByLabel('매입 기준가', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('매출 기준가', { exact: true })).toHaveValue('0.00');
    await page.getByRole('button', { name: '취소', exact: true }).click();
    await page.getByRole('button', { name: '품목 등록', exact: true }).click();
    await page.getByLabel('SKU', { exact: true }).fill(prefix.toUpperCase());
    await page.getByLabel('품목명', { exact: true }).fill('중복 테스트');
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('이미 등록된 SKU입니다.');
    await expect(page.getByLabel('품목명', { exact: true })).toHaveValue('중복 테스트');
    await page.getByRole('button', { name: '취소', exact: true }).click();

    const created = await page.request.post(`${baseURL}/api/v1/users`, {
      headers: { ...headers, Authorization: `Bearer ${adminToken}` }, data: { username, password },
    });
    expect(created.status()).toBe(201);
    const staffToken = await signIn(staffPage, company.code, username, password);
    await staffPage.getByRole('navigation', { name: '메인 메뉴' }).getByRole('link', { name: '거래처', exact: true }).click();
    await search(staffPage, prefix);
    await staffPage.getByRole('link', { name: `${prefix}_거래처`, exact: true }).click();
    await expect(staffPage.getByRole('button', { name: '비활성화', exact: true })).toHaveCount(0);
    await staffPage.getByLabel('연락처', { exact: true }).fill('010-1234-5678');
    await staffPage.getByRole('button', { name: '저장', exact: true }).click();
    await expect(staffPage.getByText('저장했습니다.', { exact: true })).toBeVisible();
    await staffPage.getByRole('navigation', { name: '메인 메뉴' }).getByRole('link', { name: '품목', exact: true }).click();
    await expect(staffPage.getByRole('button', { name: '품목 등록', exact: true })).toHaveCount(0);
    await search(staffPage, prefix);
    await staffPage.getByRole('link', { name: `${prefix}_품목`, exact: true }).click();
    await expect(staffPage.getByLabel('SKU', { exact: true })).toBeDisabled();
    await expect(staffPage.getByRole('button', { name: '저장', exact: true })).toHaveCount(0);
    const denied = await staffContext.request.patch(`${baseURL}/api/v1/items/${itemIds[0]}`, {
      headers: { 'X-Requested-With': 'XMLHttpRequest', Authorization: `Bearer ${staffToken}` }, data: { name: '권한 우회' },
    });
    expect(denied.status()).toBe(403);
    await staffPage.reload();
    await expect(staffPage.getByRole('heading', { name: '품목 상세', exact: true })).toBeVisible();
    await expect(staffPage.getByRole('navigation', { name: '메인 메뉴' })).toContainText(username);
    await staffPage.getByRole('button', { name: '로그아웃', exact: true }).click();
    await staffPage.goto('/items');
    await expect(staffPage).toHaveURL('/login');

    for (const [path, label] of [['partners', '거래처'], ['items', '품목']]) {
      await page.goto(`/${path}`);
      await search(page, prefix);
      await page.getByRole('link', { name: `${prefix}_${label}`, exact: true }).click();
      await page.getByRole('button', { name: '비활성화', exact: true }).click();
      await expect(page.getByText('비활성화했습니다.', { exact: true })).toBeVisible();
      await expect(page.getByText('조회 결과가 없습니다.')).toBeVisible();
      await page.getByRole('combobox', { name: '상태', exact: true }).selectOption('INACTIVE');
      await search(page, prefix);
      await page.getByRole('link', { name: `${prefix}_${label}`, exact: true }).click();
      await expect(page.getByRole('heading', { name: `${label} 상세`, exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: '비활성화', exact: true })).toHaveCount(0);
      await page.setViewportSize({ width: 390, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`${path}-mobile.png`), fullPage: true });
    }

    await page.route('**/api/v1/items?**', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '목록을 불러올 수 없습니다.' } }) }));
    await page.goto('/items');
    await expect(page.getByRole('alert')).toHaveText('목록을 불러올 수 없습니다.');
    await page.unroute('**/api/v1/items?**');
    await page.getByRole('combobox', { name: '상태', exact: true }).selectOption('INACTIVE');
    await search(page, prefix);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('link', { name: `${prefix}_품목`, exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath('item-list-mobile.png'), fullPage: true });
    await page.goto('/items/4294967295');
    await expect(page.getByRole('alert')).toHaveText('품목을 찾을 수 없습니다.');
    await expect(page.getByRole('button', { name: '저장', exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
  }
  finally {
    await staffContext.close();
    removeCompany(company.id);
  }
});
