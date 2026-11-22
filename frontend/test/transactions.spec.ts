import { test, expect, type Locator } from '@playwright/test';
import { baseURL, createCompany, headers, password, removeCompany, signIn } from './helpers';

const pick = async (group: Locator, name: string): Promise<void> => {
  await group.getByRole('button', { name: /^(선택|변경)$/ }).click();
  await group.getByRole('button', { name, exact: true }).click();
};

test('거래 초안·기준가 자동 입력·충돌 복구·확정·취소·목록과 반응형', async ({ page }, info) => {
  const company = await createCompany(page.request);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());

  try {
    await page.goto('/transactions');
    await expect(page).toHaveURL('/login');
    const token = await signIn(page, company.code);
    const auth = { ...headers, Authorization: `Bearer ${token}` };
    const create = async (path: string, data: object) => {
      const response = await page.request.post(`${baseURL}/api/v1/${path}`, { headers: auth, data });
      expect(response.status()).toBe(201);
      return (await response.json()).data;
    };
    await create('partners', { name: '거래 테스트 공급사', roles: ['SUPPLIER'] });
    await create('partners', { name: '거래 테스트 고객사', roles: ['CUSTOMER'] });
    const item = await create('items', { sku: 'TRX-001', name: '거래 테스트 품목', purchasePrice: '1.00', salePrice: '1250.50' });
    await create('items', { sku: 'TRX-002', name: '추가 품목', purchasePrice: '0.50' });

    await page.getByRole('navigation', { name: '메인 메뉴' }).getByRole('link', { name: '거래', exact: true }).click();
    await expect(page.getByRole('heading', { name: '매입·매출', exact: true })).toBeVisible();
    await page.getByRole('link', { name: '거래 등록', exact: true }).click();
    await expect(page).toHaveURL('/transactions/new');
    await page.getByLabel('거래일', { exact: true }).fill('2026-11-19');
    await page.getByLabel('메모', { exact: true }).fill('브라우저 초안');
    const partner = page.getByRole('group', { name: '거래처', exact: true });
    await partner.getByRole('button', { name: '선택', exact: true }).click();
    await expect(partner.getByRole('button', { name: '거래 테스트 공급사', exact: true })).toBeVisible();
    await expect(partner.getByRole('button', { name: '거래 테스트 고객사', exact: true })).toHaveCount(0);
    await partner.getByRole('button', { name: '거래 테스트 공급사', exact: true }).click();
    await pick(page.getByRole('group', { name: '품목', exact: true }).first(), '거래 테스트 품목 · TRX-001');
    await expect(page.getByLabel('단가', { exact: true })).toHaveValue('1.00');
    await page.getByLabel('수량', { exact: true }).fill('0');
    expect(await page.getByLabel('수량', { exact: true }).evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(false);
    await page.getByLabel('수량', { exact: true }).fill('1.005');
    await page.getByRole('button', { name: '품목 추가', exact: true }).click();
    await pick(page.getByRole('group', { name: '품목', exact: true }).nth(1), '거래 테스트 품목 · TRX-001');
    await page.getByRole('button', { name: '초안 저장', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('같은 품목은 한 번만 추가해주세요.');
    await page.getByRole('button', { name: '삭제', exact: true }).nth(1).click();
    await page.screenshot({ path: info.outputPath('transaction-create-desktop.png'), fullPage: true });

    const created = page.waitForResponse(response => response.url().endsWith('/transactions') && response.request().method() === 'POST');
    await page.getByRole('button', { name: '초안 저장', exact: true }).click();
    const createResponse = await created;
    expect(createResponse.status()).toBe(201);
    const transaction = (await createResponse.json()).data;
    await expect(page).toHaveURL(`/transactions/${transaction.id}`);
    await expect(page.getByText('합계 1.01', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '거래 확정', exact: true })).toBeEnabled();
    await page.getByLabel('메모', { exact: true }).fill('내 수정');
    await expect(page.getByRole('button', { name: '거래 확정', exact: true })).toBeDisabled();

    const changed = await page.request.patch(`${baseURL}/api/v1/transactions/${transaction.id}`, {
      headers: auth, data: { expectedRevision: 0, memo: '동시 수정' },
    });
    expect(changed.status()).toBe(200);
    await page.getByRole('button', { name: '초안 저장', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('다른 사용자가 수정한 거래');
    await expect(page.getByLabel('메모', { exact: true })).toHaveValue('내 수정');
    await page.getByRole('button', { name: '다시 불러오기', exact: true }).click();
    await expect(page.getByLabel('메모', { exact: true })).toHaveValue('동시 수정');
    await page.getByLabel('수량', { exact: true }).fill('2');
    await page.getByLabel('단가', { exact: true }).fill('3.21');
    await page.getByRole('button', { name: '초안 저장', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('초안을 저장했습니다.');
    await expect(page.getByText('합계 6.42', { exact: true })).toBeVisible();

    expect((await page.request.patch(`${baseURL}/api/v1/items/${item.id}`, { headers: auth, data: { name: '수정된 품목', purchasePrice: '999' } })).status()).toBe(200);
    await page.reload();
    await expect(page.getByRole('group', { name: '품목', exact: true })).toContainText('거래 테스트 품목 · TRX-001');
    await expect(page.getByLabel('단가', { exact: true })).toHaveValue('3.21');
    await page.getByRole('button', { name: '거래 확정', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('거래를 확정했습니다.');
    await expect(page.getByRole('button', { name: '초안 저장', exact: true })).toHaveCount(0);
    await expect(page.getByRole('table')).toContainText('거래 테스트 품목');
    await expect(page.getByRole('table')).toContainText('6.42');
    await page.screenshot({ path: info.outputPath('transaction-confirmed-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('transaction-detail-mobile.png'), fullPage: true });
    await page.getByRole('button', { name: '거래 취소', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('거래를 취소했습니다.');
    await expect(page.getByRole('button', { name: '거래 취소', exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByText('합계 6.42', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: '목록', exact: true }).click();
    await page.getByRole('combobox', { name: '상태', exact: true }).selectOption('CANCELED');
    await page.getByLabel('검색', { exact: true }).fill('거래 테스트 공급사');
    await page.getByLabel('시작일', { exact: true }).fill('2026-11-19');
    await page.getByLabel('종료일', { exact: true }).fill('2026-11-19');
    await page.getByRole('button', { name: '검색', exact: true }).click();
    await expect(page.getByRole('table').getByRole('link', { name: transaction.number, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('transaction-list-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.screenshot({ path: info.outputPath('transaction-list-desktop.png'), fullPage: true });

    await page.goto('/transactions/new');
    await page.getByRole('combobox', { name: '거래 종류', exact: true }).selectOption('SALE');
    await pick(page.getByRole('group', { name: '거래처', exact: true }), '거래 테스트 고객사');
    await pick(page.getByRole('group', { name: '품목', exact: true }), '수정된 품목 · TRX-001');
    await expect(page.getByLabel('단가', { exact: true })).toHaveValue('1,250.50');
    await page.getByLabel('수량', { exact: true }).fill('2');
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('transaction-form-mobile.png'), fullPage: true });
    await page.getByRole('button', { name: '초안 저장', exact: true }).click();
    await expect(page.getByText('합계 2501.00', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  }
  finally { removeCompany(company.id); }
});

test('직원 거래 작성·확정과 취소 차단·다른 회사 거래 접근', async ({ page, browser }) => {
  const company = await createCompany(page.request);
  const other = await createCompany(page.request);
  const staffContext = await browser.newContext({ baseURL });
  const staffPage = await staffContext.newPage();
  staffPage.on('dialog', dialog => dialog.accept());

  try {
    const token = await signIn(page, company.code);
    const auth = { ...headers, Authorization: `Bearer ${token}` };
    expect((await page.request.post(`${baseURL}/api/v1/users`, { headers: auth, data: { username: 'employee', password } })).status()).toBe(201);
    const partner = await page.request.post(`${baseURL}/api/v1/partners`, { headers: auth, data: { name: '직원 공급사', roles: ['SUPPLIER'] } });
    const item = await page.request.post(`${baseURL}/api/v1/items`, { headers: auth, data: { sku: 'STAFF', name: '직원 품목', purchasePrice: '10.00' } });
    expect(partner.status()).toBe(201);
    expect(item.status()).toBe(201);
    const staffToken = await signIn(staffPage, company.code, 'employee');
    await staffPage.goto('/transactions/new');
    await pick(staffPage.getByRole('group', { name: '거래처', exact: true }), '직원 공급사');
    await pick(staffPage.getByRole('group', { name: '품목', exact: true }), '직원 품목 · STAFF');
    await staffPage.getByRole('button', { name: '초안 저장', exact: true }).click();
    await expect(staffPage.getByText('합계 10.00', { exact: true })).toBeVisible();
    const id = new URL(staffPage.url()).pathname.split('/').at(-1);
    await expect(staffPage.getByRole('button', { name: '거래 취소', exact: true })).toHaveCount(0);
    await staffPage.getByRole('button', { name: '거래 확정', exact: true }).click();
    await expect(staffPage.getByRole('status')).toHaveText('거래를 확정했습니다.');
    const denied = await staffPage.request.post(`${baseURL}/api/v1/transactions/${id}/cancel`, { headers: { ...headers, Authorization: `Bearer ${staffToken}` }, data: { expectedRevision: 0 } });
    expect(denied.status()).toBe(403);

    await page.getByRole('button', { name: '로그아웃', exact: true }).click();
    await expect(page.getByRole('link', { name: '로그인', exact: true }).first()).toBeVisible();
    await signIn(page, other.code);
    await page.goto(`/transactions/${id}`);
    await expect(page.getByRole('alert')).toHaveText('거래를 찾을 수 없습니다.');
    await expect(page.getByRole('table')).toHaveCount(0);
    await page.goto('/transactions');
    await expect(page.getByText('조회 결과가 없습니다.', { exact: true })).toBeVisible();
  }
  finally { await staffContext.close(); removeCompany(company.id); removeCompany(other.id); }
});

test('담당 직원별 접근 제한·관리자 재배정·미열람 표시', async ({ page, browser }, info) => {
  const company = await createCompany(page.request);
  const firstContext = await browser.newContext({ baseURL });
  const secondContext = await browser.newContext({ baseURL });
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();

  try {
    const adminToken = await signIn(page, company.code);
    const adminHeaders = { ...headers, Authorization: `Bearer ${adminToken}` };
    const create = async (path: string, data: object) => {
      const response = await page.request.post(`${baseURL}/api/v1/${path}`, { headers: adminHeaders, data });
      expect(response.status()).toBe(201);
      return (await response.json()).data;
    };
    await create('users', { username: 'staff_a', password });
    await create('users', { username: 'staff_b', password });
    const partner = await create('partners', { name: '배정 공급사', roles: ['SUPPLIER'] });
    const item = await create('items', { sku: 'ASSIGN', name: '배정 품목', purchasePrice: '100' });
    const firstToken = await signIn(first, company.code, 'staff_a');
    const secondToken = await signIn(second, company.code, 'staff_b');
    const response = await first.request.post(`${baseURL}/api/v1/transactions`, {
      headers: { ...headers, Authorization: `Bearer ${firstToken}` },
      data: { type: 'PURCHASE', partnerId: partner.id, occurredAt: '2026-11-19', lines: [{ itemId: item.id, quantity: '2', unitPrice: '100' }] },
    });
    expect(response.status()).toBe(201);
    const entry = (await response.json()).data;
    expect(entry.number).toMatch(/^[0-9a-f]{16}$/);
    await first.goto(`/transactions/${entry.id}`);
    await expect(first.getByLabel('담당 직원', { exact: true })).toHaveValue('staff_a');
    await expect(first.getByRole('button', { name: '담당자 적용', exact: true })).toHaveCount(0);

    await second.goto('/transactions');
    await expect(second.getByText('조회 결과가 없습니다.', { exact: true })).toBeVisible();
    await second.goto(`/transactions/${entry.id}`);
    await expect(second.getByRole('alert')).toHaveText('거래를 찾을 수 없습니다.');
    await expect(second.getByRole('button', { name: '초안 저장', exact: true })).toHaveCount(0);
    expect((await second.request.post(`${baseURL}/api/v1/transactions/${entry.id}/confirm`, {
      headers: { ...headers, Authorization: `Bearer ${secondToken}` }, data: { expectedRevision: 0 },
    })).status()).toBe(404);

    await page.goto(`/transactions/${entry.id}`);
    await expect(page.getByLabel('작성자', { exact: true })).toHaveValue('staff_a');
    await pick(page.getByRole('group', { name: '담당 직원', exact: true }), 'staff_b');
    await page.getByRole('button', { name: '담당자 적용', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('담당자를 변경했습니다.');
    await first.reload();
    await expect(first.getByRole('alert')).toHaveText('거래를 찾을 수 없습니다.');
    await first.goto('/transactions');
    await expect(first.getByText('조회 결과가 없습니다.', { exact: true })).toBeVisible();

    await second.goto('/transactions');
    await expect(second.getByLabel('미열람 거래')).toHaveText('NEW');
    await expect(second.getByRole('table')).toContainText('staff_b');
    await second.getByRole('link', { name: entry.number, exact: true }).click();
    await expect(second.getByLabel('담당 직원', { exact: true })).toHaveValue('staff_b');
    await expect(second.getByLabel('작성자', { exact: true })).toHaveValue('staff_a');
    await second.getByLabel('메모', { exact: true }).fill('새 담당자 수정');
    await second.getByRole('button', { name: '초안 저장', exact: true }).click();
    await expect(second.getByRole('status')).toHaveText('초안을 저장했습니다.');
    await second.setViewportSize({ width: 390, height: 844 });
    expect(await second.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await second.screenshot({ path: info.outputPath('assigned-detail-mobile.png'), fullPage: true });
    await second.getByRole('link', { name: '목록', exact: true }).click();
    await expect(second.getByRole('link', { name: entry.number, exact: true })).toBeVisible();
    await expect(second.getByLabel('미열람 거래')).toHaveCount(0);
    await second.reload();
    await expect(second.getByRole('link', { name: entry.number, exact: true })).toBeVisible();
    await expect(second.getByLabel('미열람 거래')).toHaveCount(0);

    await page.reload();
    await pick(page.getByRole('group', { name: '담당 직원', exact: true }), 'staff_a');
    await page.getByRole('button', { name: '담당자 적용', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('담당자를 변경했습니다.');
    await pick(page.getByRole('group', { name: '담당 직원', exact: true }), 'staff_b');
    await page.getByRole('button', { name: '담당자 적용', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('담당자를 변경했습니다.');
    await second.reload();
    await expect(second.getByRole('link', { name: entry.number, exact: true })).toBeVisible();
    await expect(second.getByLabel('미열람 거래')).toHaveCount(0);
    await page.goto('/transactions');
    await expect(page.getByRole('table')).toContainText('staff_b');
    await page.screenshot({ path: info.outputPath('assigned-list-desktop.png'), fullPage: true });
  }
  finally { await firstContext.close(); await secondContext.close(); removeCompany(company.id); }
});
