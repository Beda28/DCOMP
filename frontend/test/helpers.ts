import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { execFileSync }  from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const password = 'browser-test-password-123';
export const baseURL  = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost';
export const headers  = { 'X-Requested-With': 'XMLHttpRequest' };

export const createCompany = async (request: APIRequestContext) => {
  const companyName = `e2e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const response = await request.post(`${baseURL}/api/v1/organizations/register`, { headers, data: { companyName, username: 'admin', password } });
  expect(response.status()).toBe(201);
  return (await response.json()).data.organization as { id: number; name: string; code: string };
};

export const signIn = async (page: Page, companyCode: string, username = 'admin', secret = password): Promise<string> => {
  await page.goto(`${baseURL}/login`);
  await page.getByLabel('회사 코드', { exact: true }).fill(companyCode);
  await page.getByLabel('아이디', { exact: true }).fill(username);
  await page.getByLabel('비밀번호', { exact: true }).fill(secret);
  const submit = async () => {
    const response = page.waitForResponse(reply => reply.url().endsWith('/auth/login'));
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    return response;
  };
  let response = await submit();
  if (response.status() === 429) {
    const seconds = Number(response.headers()['retry-after'] ?? 60);
    await new Promise(resolve => setTimeout(resolve, (seconds + 1) * 1000));
    response = await submit();
  }
  expect(response.status()).toBe(200);
  await expect(page).toHaveURL(`${baseURL}/`);
  return (await response.json()).data.accessToken;
};

export const removeCompany = (id: number): void => {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('잘못된 테스트 회사 ID');
  execFileSync('docker', ['compose', '-p', process.env.PLAYWRIGHT_COMPOSE_PROJECT ?? 'dcomp', 'exec', '-T', 'backend', 'node', '--input-type=module'], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)),
    input: `
      import { DataSource } from 'typeorm';
      import { databaseOptions } from './dist/database/database.config.js';
      const db = await new DataSource(databaseOptions).initialize();
      try {
        await db.transaction(async manager => {
          const [company] = await manager.query('SELECT name FROM organizations WHERE id = ?', [${id}]);
          if (!company?.name.startsWith('e2e_')) throw new Error('테스트 회사만 삭제할 수 있습니다.');
          await manager.query('DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM users WHERE organization_id = ?)', [${id}]);
          for (const table of ['transaction_reads', 'transaction_lines', 'transactions', 'partners', 'items', 'users']) await manager.query('DELETE FROM ' + table + ' WHERE organization_id = ?', [${id}]);
          await manager.query('DELETE FROM organizations WHERE id = ?', [${id}]);
        });
      }
      finally { await db.destroy(); }
    `,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
};
