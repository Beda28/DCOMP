import { test, expect } from '@playwright/test';
import { baseURL, createCompany, headers, removeCompany, signIn } from './helpers';

test('문서 업로드부터 실제 OCR·미리보기·보정 충돌·재처리·목록까지', async ({ page, request }) => {
  test.skip(process.env.FASTAPI_ENABLED !== 'true', 'OCR·관련도 검색은 개발 보류');
  const company = await createCompany(request);
  try {
    const token = await signIn(page, company.code);
    await page.getByRole('link', { name: '문서', exact: true }).click();
    await page.getByRole('link', { name: '문서 업로드', exact: true }).click();
    const png = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 1400; canvas.height = 650;
      const context = canvas.getContext('2d')!;
      context.fillStyle = 'white'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = 'black'; context.font = '48px Arial';
      ['INVOICE', 'DATE 2026-11-22', 'TOTAL 12345.00', 'MERCHANT: DCOMP'].forEach((line, index) => context.fillText(line, 80, 100 + 110 * index));
      return canvas.toDataURL('image/png').split(',')[1];
    });
    await page.getByLabel('문서 파일').setInputFiles({ name: '검증 문서.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await page.getByRole('button', { name: '업로드', exact: true }).click();
    await expect(page).toHaveURL(/\/documents\/\d+$/);
    const id = Number(page.url().split('/').pop());
    await expect(page.getByRole('heading', { name: '검증 문서.png' })).toBeVisible();
    await expect(page.getByLabel('합계 금액')).toHaveValue('12345.00', { timeout: 60000 });
    await expect(page.getByLabel('문서 내용')).toHaveValue(/12345/);
    await page.getByRole('button', { name: '원본 미리보기' }).click();
    await expect(page.getByAltText('문서 원본')).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: '원본 다운로드' }).click();
    expect((await download).suggestedFilename()).toBe('검증 문서.png');
    await page.getByLabel('상호', { exact: true }).fill('보정한 문서 상호');
    await page.getByLabel('문서 내용').fill('고유검색어 바나나 납품 보정 문서');
    await page.getByRole('button', { name: '보정 저장' }).click();
    await expect(page.getByRole('status')).toHaveText('보정 내용을 저장했습니다.');
    await page.getByText(/수정 #/).click();
    await expect(page.getByRole('heading', { name: '변경 전' })).toBeVisible();
    await page.getByLabel('문서 내용').fill('저장되지 않은 초안');
    const apiHeaders = { ...headers, Authorization: `Bearer ${token}` };
    const current = (await (await request.get(`${baseURL}/api/v1/documents/${id}`, { headers: apiHeaders })).json()).data;
    expect((await request.patch(`${baseURL}/api/v1/documents/${id}/corrections`, {
      headers: apiHeaders, data: { expectedRevision: current.revision, correctedText: '다른 창에서 저장한 내용' },
    })).status()).toBe(200);
    await page.getByRole('button', { name: '보정 저장' }).click();
    await expect(page.getByRole('alert')).toContainText('다른 사용자가 수정');
    await expect(page.getByLabel('문서 내용')).toHaveValue('저장되지 않은 초안');
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: '다시 불러오기' }).click();
    await expect(page.getByLabel('문서 내용')).toHaveValue('다른 창에서 저장한 내용');
    await page.getByRole('button', { name: 'OCR 재처리' }).click();
    await expect(page.getByRole('status').filter({ hasText: '재처리를 요청' })).toBeVisible();
    await expect(page.getByLabel('문서 내용')).toHaveValue('다른 창에서 저장한 내용', { timeout: 60000 });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('link', { name: '목록', exact: true }).click();
    await page.getByLabel('검색', { exact: true }).fill('다른 창에서');
    await page.getByRole('button', { name: '검색', exact: true }).click();
    await expect(page.getByRole('link', { name: '검증 문서.png' })).toBeVisible();
    await page.getByRole('link', { name: '검색', exact: true }).click();
    await page.getByLabel('검색어').fill('다른 창에서');
    await page.getByRole('button', { name: '검색', exact: true }).click();
    await expect(page.getByRole('article')).toContainText('다른 창에서 저장한 내용');
    await expect(page.getByRole('link', { name: '검증 문서.png' })).toBeVisible();
    await page.getByLabel('검색어').fill('unknownenglishword');
    await page.getByRole('button', { name: '검색', exact: true }).click();
    await expect(page.getByText('검색 결과가 없습니다.')).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('link', { name: '검증 문서.png' })).toBeVisible();
  }
  finally { removeCompany(company.id); }
});

test('FastAPI 없이 증빙 업로드·직접 입력·목록 검색·보류 안내', async ({ page, request }) => {
  test.skip(process.env.FASTAPI_ENABLED === 'true', '기본 ERP 모드에서 검증');
  const company = await createCompany(request);
  try {
    await signIn(page, company.code);
    await page.goto('/documents/new');
    await expect(page.getByText(/자동 인식은 개발 보류/)).toBeVisible();
    await page.getByLabel('문서 파일').setInputFiles({ name: '수기 증빙.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1sAAAAASUVORK5CYII=', 'base64') });
    await page.getByRole('button', { name: '업로드', exact: true }).click();
    await expect(page).toHaveURL(/\/documents\/\d+$/);
    await expect(page.getByRole('button', { name: 'OCR 재처리' })).toHaveCount(0);
    await page.getByLabel('문서 내용').fill('직접 입력한 매입 증빙');
    await page.getByLabel('합계 금액').fill('1200.00');
    await page.getByRole('button', { name: '보정 저장' }).click();
    await expect(page.getByRole('status')).toHaveText('보정 내용을 저장했습니다.');
    await page.reload();
    await expect(page.getByLabel('문서 내용')).toHaveValue('직접 입력한 매입 증빙');
    await page.getByRole('button', { name: '원본 미리보기' }).click();
    await expect(page.getByRole('img', { name: '문서 원본' })).toBeVisible();
    await page.getByRole('link', { name: '목록', exact: true }).click();
    await page.getByLabel('검색', { exact: true }).fill('직접 입력한');
    await page.getByRole('button', { name: '검색', exact: true }).click();
    await expect(page.getByRole('link', { name: '수기 증빙.png' })).toBeVisible();
    await page.goto('/search');
    await expect(page.getByText(/개발 보류 상태입니다/)).toBeVisible();
    await page.goto('/health');
    await expect(page.locator('[data-status="disabled"]')).toHaveText('개발 보류');
  }
  finally { removeCompany(company.id); }
});
