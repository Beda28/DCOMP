import { test, expect } from '@playwright/test';
import { baseURL, createCompany, headers, removeCompany, signIn } from './helpers';

test.use({ actionTimeout: 10000 });

test('거래·문서 목록의 재검색·필터 유지·페이지 복귀·오류 복구', async ({ page, request }) => {
  const company = await createCompany(request);
  try {
    const token = await signIn(page, company.code);
    const auth = { ...headers, Authorization: `Bearer ${token}` };
    const create = async (path: string, data: object) => {
      const response = await request.post(`${baseURL}/api/v1/${path}`, { headers: auth, data });
      expect(response.status()).toBe(201);
      return (await response.json()).data;
    };
    const partner = await create('partners', { name: '목록 거래처', roles: ['CUSTOMER', 'SUPPLIER'] });
    const item = await create('items', { sku: 'LIST', name: '목록 품목' });
    const input = { type: 'PURCHASE', partnerId: partner.id, occurredAt: '2026-11-23', memo: '목록 검증', lines: [{ itemId: item.id, quantity: '1', unitPrice: '100' }] };
    const entries = [];
    for (const type of ['PURCHASE', 'PURCHASE', 'SALE']) entries.push(await create('transactions', { ...input, type }));

    await page.goto(`/transactions?partnerId=${partner.id}&limit=1&page=99`);
    await expect(page).toHaveURL(/page=3/);
    await expect(page.getByText('3 / 3', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '이전', exact: true }).click();
    await expect(page).toHaveURL(/page=2/);
    await page.goBack();
    await expect(page.getByText('3 / 3', { exact: true })).toBeVisible();

    await page.getByLabel('검색', { exact: true }).fill('목록 검증');
    await page.getByRole('combobox', { name: '거래 종류', exact: true }).selectOption('PURCHASE');
    await page.getByLabel('시작일', { exact: true }).fill('2026-11-23');
    await page.getByLabel('종료일', { exact: true }).fill('2026-11-23');
    await page.getByRole('button', { name: '검색', exact: true }).click();
    await expect(page.getByText('총 2건', { exact: true })).toBeVisible();
    expect(new URL(page.url()).searchParams.get('partnerId')).toBe(String(partner.id));
    await create('transactions', input);
    await page.getByRole('button', { name: '검색', exact: true }).click();
    await expect(page.getByText('총 3건', { exact: true })).toBeVisible();

    await page.route('**/api/v1/transactions?*', route => route.fulfill({
      status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '목록을 불러오지 못했습니다.' } }),
    }));
    await page.getByRole('button', { name: '새로고침', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('목록을 불러오지 못했습니다.');
    await page.unroute('**/api/v1/transactions?*');
    await page.getByRole('button', { name: '검색', exact: true }).click();
    await expect(page.getByText('총 3건', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '초기화', exact: true }).click();
    await expect(page).toHaveURL('/transactions');
    await expect(page.getByText('총 4건', { exact: true })).toBeVisible();

    for (const [index, entry] of entries.entries()) {
      const response = await request.post(`${baseURL}/api/v1/documents`, {
        headers: auth, multipart: { kind: 'RECEIPT', transactionId: String(entry.id),
          file: { name: `receipt-${index}.png`, mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a00000000', 'hex') } },
      });
      expect(response.status()).toBe(201);
    }
    await page.goto('/documents?limit=1&page=99');
    await expect(page.getByText('3 / 3', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '이전', exact: true }).click();
    await expect(page.getByText('2 / 3', { exact: true })).toBeVisible();
    await page.goBack();
    await expect(page.getByText('3 / 3', { exact: true })).toBeVisible();

    const date = new Date().toISOString().slice(0, 10);
    await page.goto(`/documents?transactionId=${entries[0].id}&q=receipt&kind=RECEIPT&from=${date}&to=${date}&page=99${process.env.FASTAPI_ENABLED === 'true' ? '' : '&status=READY'}`);
    await expect(page.getByText('총 1건', { exact: true })).toBeVisible();
    await expect(page.getByText('1 / 1', { exact: true })).toBeVisible();
    if (process.env.FASTAPI_ENABLED !== 'true') {
      await expect(page.getByRole('combobox', { name: '처리 상태' })).toHaveCount(0);
      await expect(page.getByRole('columnheader', { name: '처리 상태' })).toHaveCount(0);
      expect(new URL(page.url()).searchParams.has('status')).toBe(false);
    }
    await page.getByRole('button', { name: '연결 필터 해제' }).click();
    await expect(page.getByText('총 3건', { exact: true })).toBeVisible();
    const query = new URL(page.url()).searchParams;
    expect(query.has('transactionId')).toBe(false);
    expect(query.get('q')).toBe('receipt');
    expect(query.get('kind')).toBe('RECEIPT');
    expect(query.get('from')).toBe(date);
    expect(query.get('to')).toBe(date);
    await page.getByLabel('검색', { exact: true }).fill('없는 문서');
    await page.getByRole('button', { name: '검색', exact: true }).click();
    await expect(page.getByText('조회 결과가 없습니다.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '초기화', exact: true }).click();
    await expect(page).toHaveURL('/documents');
    await expect(page.getByText('총 3건', { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  finally { removeCompany(company.id); }
});
