import assert              from 'node:assert/strict';
import test                from 'node:test';
import { DataSource }      from 'typeorm';
import { databaseOptions } from '../dist/database/database.config.js';

if (process.env.DB_NAME !== 'dcomp_test') throw new Error('전용 dcomp_test DB에서만 실행할 수 있습니다.');

const tables = [
  'organizations', 'users', 'auth_sessions', 'partners', 'items', 'transactions',
  'transaction_lines', 'documents', 'document_jobs', 'document_edits',
];

test('MySQL 초기 스키마와 데이터 제약', async context => {
  const database = await new DataSource(databaseOptions).initialize();
  const db       = database.createQueryRunner();

  const insert = async (sql, values = []) => (await db.query(sql, values)).insertId;
  const rejects = (sql, values, code) => assert.rejects(
    () => db.query(sql, values),
    error => error.driverError?.code === code,
  );

  try {
    await context.test('초기 SQL로 생성된 10개 테이블과 UTC 설정', async () => {
      const rows = await database.query(`
        SELECT TABLE_NAME AS name, TABLE_COLLATION AS collation, ENGINE AS engine
        FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()
      `);
      assert.deepEqual(rows.map(row => row.name).sort(), [...tables].sort());
      assert.ok(rows.every(row => row.collation === 'utf8mb4_0900_ai_ci' && row.engine === 'InnoDB'));

      const [session] = await database.query('SELECT @@session.time_zone AS timezone');
      assert.equal(session.timezone, '+00:00');
    });

    await db.startTransaction();

    const organizationId = await insert("INSERT INTO organizations (name, code) VALUES ('Schema test', '000125')");
    const otherOrganizationId = await insert("INSERT INTO organizations (name, code) VALUES ('Other company', '000126')");
    const user = await insert(`INSERT INTO users (organization_id, username, password_hash) VALUES (${organizationId}, ?, ?)`, ['admin', 'test-hash']);
    const otherUser = await insert(`INSERT INTO users (organization_id, username, password_hash) VALUES (${organizationId}, ?, ?)`, ['staff', 'test-hash']);
    const partner = await insert(`INSERT INTO partners (organization_id, name, is_supplier, biz_number) VALUES (${organizationId}, ?, 1, ?)`, ['거래처', '123-45-67890']);
    const item = await insert(`INSERT INTO items (organization_id, sku, name, sale_price) VALUES (${organizationId}, ?, ?, ?)`, ['ITEM-001', '원래 품목명', '0.04']);
    const otherItem = await insert(`INSERT INTO items (organization_id, sku, name) VALUES (${organizationId}, ?, ?)`, ['ITEM-002', '다른 품목']);
    const transaction = await insert(`
      INSERT INTO transactions (organization_id, number, partner_id, created_by, type, occurred_at)
      VALUES (${organizationId}, 'TRX-TEST-001', ?, ?, 'PURCHASE', '2026-11-18')
    `, [partner, user]);

    await context.test('계정 아이디·Refresh 해시 중복 차단, 세션 계열 내 토큰 회전 허용', async () => {
      await rejects(`INSERT INTO users (organization_id, username, password_hash) VALUES (${organizationId}, ?, ?)`, ['ADMIN', 'hash'], 'ER_DUP_ENTRY');

      const sql = 'INSERT INTO auth_sessions (user_id, family_id, refresh_token_hash, expires_at) VALUES (?, ?, ?, ?)';
      const family = '00000000-0000-4000-8000-000000000001';
      await db.query(sql, [user, family, 'a'.repeat(64), '2026-11-25 00:00:00']);
      await db.query(sql, [user, family, 'b'.repeat(64), '2026-11-25 00:00:00']);
      await rejects(sql, [user, family, 'a'.repeat(64), '2026-11-25 00:00:00'], 'ER_DUP_ENTRY');
      await rejects(sql, [4294967295, family, 'c'.repeat(64), '2026-11-25 00:00:00'], 'ER_NO_REFERENCED_ROW_2');

      const [account] = await db.query('SELECT role, status FROM users WHERE id = ?', [user]);
      assert.deepEqual(account, { role: 'STAFF', status: 'ACTIVE' });
    });

    await context.test('거래처 역할 필수·불리언 범위·사업자번호 중복 검증', async () => {
      await rejects(`INSERT INTO partners (organization_id, name) VALUES (${organizationId}, ?)`, ['역할 없음'], 'ER_CHECK_CONSTRAINT_VIOLATED');
      await rejects(`INSERT INTO partners (organization_id, name, is_customer, is_supplier) VALUES (${organizationId}, ?, 2, 1)`, ['잘못된 역할'], 'ER_CHECK_CONSTRAINT_VIOLATED');
      await rejects(`INSERT INTO partners (organization_id, name, is_customer, biz_number) VALUES (${organizationId}, ?, 1, ?)`, ['중복 거래처', '123-45-67890'], 'ER_DUP_ENTRY');
      await db.query(`INSERT INTO partners (organization_id, name, is_customer, is_supplier) VALUES (${organizationId}, '고객사', 1, 0), (${organizationId}, '겸업 업체', 1, 1)`);
    });

    await context.test('품목 SKU 중복과 음수 가격 차단, 기본가 미지정 허용', async () => {
      await rejects(`INSERT INTO items (organization_id, sku, name) VALUES (${organizationId}, ?, ?)`, ['ITEM-001', '중복'], 'ER_DUP_ENTRY');
      await rejects('UPDATE items SET purchase_price = -1 WHERE id = ?', [item], 'ER_CHECK_CONSTRAINT_VIOLATED');
      await rejects('UPDATE items SET sale_price = -1 WHERE id = ?', [item], 'ER_CHECK_CONSTRAINT_VIOLATED');

      const [row] = await db.query('SELECT unit, purchase_price, sale_price FROM items WHERE id = ?', [otherItem]);
      assert.deepEqual(row, { unit: 'EA', purchase_price: null, sale_price: null });
    });

    const lineSql = `
      INSERT INTO transaction_lines
        (organization_id, transaction_id, item_id, position, quantity, unit_price, line_amount, item_sku_snapshot, item_name_snapshot)
      VALUES (${organizationId}, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const line = [transaction, item, 1, '0.125', '0.04', '0.01', 'ITEM-001', '원래 품목명'];
    await db.query(lineSql, line);

    await context.test('거래 라인 소수점 정밀도·중복·금액 범위 검증', async () => {
      const [row] = await db.query(`
        SELECT quantity, unit_price, line_amount, ROUND(quantity * unit_price, 2) AS calculated
        FROM transaction_lines WHERE transaction_id = ?
      `, [transaction]);
      assert.deepEqual(row, { quantity: '0.125', unit_price: '0.04', line_amount: '0.01', calculated: '0.01' });

      await rejects(lineSql, [transaction, otherItem, 1, '1', '1', '1', 'ITEM-002', '중복 순서'], 'ER_DUP_ENTRY');
      await rejects(lineSql, [transaction, item, 2, '1', '1', '1', 'ITEM-001', '중복 품목'], 'ER_DUP_ENTRY');
      await rejects(lineSql, [transaction, otherItem, 2, '0', '1', '0', 'ITEM-002', '수량 없음'], 'ER_CHECK_CONSTRAINT_VIOLATED');
      await rejects(lineSql, [transaction, otherItem, 2, '1', '-1', '0', 'ITEM-002', '음수 단가'], 'ER_CHECK_CONSTRAINT_VIOLATED');
      await rejects('UPDATE transactions SET total_amount = -1 WHERE id = ?', [transaction], 'ER_CHECK_CONSTRAINT_VIOLATED');
    });

    await context.test('품목 변경 후 거래 스냅샷 유지, 참조된 거래처·품목 삭제 차단', async () => {
      await db.query("UPDATE items SET name = '변경 품목명', sale_price = 9000, status = 'INACTIVE' WHERE id = ?", [item]);
      await db.query("UPDATE partners SET status = 'INACTIVE' WHERE id = ?", [partner]);

      const [row] = await db.query('SELECT item_name_snapshot, unit_price FROM transaction_lines WHERE transaction_id = ?', [transaction]);
      assert.deepEqual(row, { item_name_snapshot: '원래 품목명', unit_price: '0.04' });
      await rejects('DELETE FROM partners WHERE id = ?', [partner], 'ER_ROW_IS_REFERENCED_2');
      await rejects('DELETE FROM items WHERE id = ?', [item], 'ER_ROW_IS_REFERENCED_2');
      await rejects('DELETE FROM transactions WHERE id = ?', [transaction], 'ER_ROW_IS_REFERENCED_2');
    });

    const documentSql = `
      INSERT INTO documents
        (organization_id, uploaded_by, kind, original_filename, content_type, size_bytes, storage_key, sha256, upload_key, upload_request_hash)
      VALUES (${organizationId}, ?, 'RECEIPT', 'receipt.png', 'image/png', 100, ?, ?, ?, ?)
    `;
    const hash = 'd'.repeat(64);
    const document = await insert(documentSql, [user, 'original.png', hash, null, null]);

    await context.test('동일 파일 해시·선택적 연결 허용, 저장 키·업로드 멱등 키 제약 검증', async () => {
      await db.query(documentSql, [user, 'duplicate-content.png', hash, null, null]);
      await db.query(documentSql, [user, 'keyed.png', hash, 'upload-1', hash]);
      await db.query(documentSql, [otherUser, 'other-user.png', hash, 'upload-1', hash]);
      await rejects(documentSql, [user, 'original.png', hash, null, null], 'ER_DUP_ENTRY');
      await rejects(documentSql, [user, 'duplicate-key.png', hash, 'upload-1', hash], 'ER_DUP_ENTRY');
      await rejects(documentSql, [user, 'missing-hash.png', hash, 'upload-2', null], 'ER_CHECK_CONSTRAINT_VIOLATED');
      await rejects(documentSql, [user, 'missing-key.png', hash, null, hash], 'ER_CHECK_CONSTRAINT_VIOLATED');
      await rejects('UPDATE documents SET size_bytes = 0 WHERE id = ?', [document], 'ER_CHECK_CONSTRAINT_VIOLATED');
      await rejects('UPDATE documents SET partner_id = 4294967295 WHERE id = ?', [document], 'ER_NO_REFERENCED_ROW_2');

      const [row] = await db.query('SELECT partner_id, transaction_id, status, revision, current_job_version FROM documents WHERE id = ?', [document]);
      assert.deepEqual(row, { partner_id: null, transaction_id: null, status: 'UPLOADED', revision: 0, current_job_version: 0 });
    });

    await context.test('문서 작업 버전·BullMQ ID 중복 차단, 큐 등록 대기 상태 보존', async () => {
      const sql = 'INSERT INTO document_jobs (document_id, version, bullmq_job_id) VALUES (?, ?, ?)';
      const job = await insert(sql, [document, 1, `ocr-${document}-1`]);
      await db.query(sql, [document, 2, `ocr-${document}-2`]);
      await rejects(sql, [document, 1, 'another-id'], 'ER_DUP_ENTRY');
      await rejects(sql, [document, 3, `ocr-${document}-1`], 'ER_DUP_ENTRY');
      await rejects(sql, [document, 0, 'invalid-version'], 'ER_CHECK_CONSTRAINT_VIOLATED');

      const [row] = await db.query('SELECT status, attempts FROM document_jobs WHERE id = ?', [job]);
      assert.deepEqual(row, { status: 'PENDING_ENQUEUE', attempts: 0 });
    });

    await context.test('보정 이력의 문서별 revision 고유성·JSON·외래키 검증', async () => {
      const sql = `INSERT INTO document_edits (organization_id, document_id, editor_id, revision, before_json, after_json) VALUES (${organizationId}, ?, ?, ?, ?, ?)`;
      const before = JSON.stringify({ issuer: '원래 발급자' });
      const after = JSON.stringify({ issuer: '수정 발급자' });
      await db.query(sql, [document, user, 1, before, after]);
      await rejects(sql, [document, user, 1, before, after], 'ER_DUP_ENTRY');
      await rejects(sql, [document, user, 0, before, after], 'ER_CHECK_CONSTRAINT_VIOLATED');
      await rejects(sql, [document, 4294967295, 2, before, after], 'ER_NO_REFERENCED_ROW_2');
      await rejects('DELETE FROM documents WHERE id = ?', [document], 'ER_ROW_IS_REFERENCED_2');
    });

    await context.test('회사별 식별값 고유성과 복합 외래키', async () => {
      const foreignUser = await insert("INSERT INTO users (organization_id, username, password_hash) VALUES (?, 'admin', 'hash')", [otherOrganizationId]);
      const foreignPartner = await insert("INSERT INTO partners (organization_id, name, is_customer, biz_number) VALUES (?, 'Other', 1, '123-45-67890')", [otherOrganizationId]);
      const foreignItem = await insert("INSERT INTO items (organization_id, sku, name) VALUES (?, 'ITEM-001', 'Other')", [otherOrganizationId]);
      for (const [sql, id] of [
        ['UPDATE transactions SET partner_id = ? WHERE id = ?', foreignPartner],
        ['UPDATE transactions SET created_by = ? WHERE id = ?', foreignUser],
      ]) await rejects(sql, [id, transaction], 'ER_NO_REFERENCED_ROW_2');
      await rejects('UPDATE transaction_lines SET item_id = ? WHERE transaction_id = ?', [foreignItem, transaction], 'ER_NO_REFERENCED_ROW_2');
      await rejects('UPDATE transaction_lines SET organization_id = ? WHERE transaction_id = ?', [otherOrganizationId, transaction], 'ER_NO_REFERENCED_ROW_2');
      await rejects('UPDATE documents SET uploaded_by = ? WHERE id = ?', [foreignUser, document], 'ER_NO_REFERENCED_ROW_2');
      await rejects('UPDATE documents SET partner_id = ? WHERE id = ?', [foreignPartner, document], 'ER_NO_REFERENCED_ROW_2');
      await rejects('UPDATE documents SET organization_id = ? WHERE id = ?', [otherOrganizationId, document], 'ER_ROW_IS_REFERENCED_2');
      await rejects('UPDATE document_edits SET editor_id = ? WHERE document_id = ?', [foreignUser, document], 'ER_NO_REFERENCED_ROW_2');
      await rejects('UPDATE document_edits SET organization_id = ? WHERE document_id = ?', [otherOrganizationId, document], 'ER_NO_REFERENCED_ROW_2');
      await rejects("INSERT INTO organizations (name, code) VALUES ('Invalid', 'abc123')", [], 'ER_CHECK_CONSTRAINT_VIOLATED');
      await rejects("INSERT INTO organizations (name, code) VALUES ('Duplicate', '000125')", [], 'ER_DUP_ENTRY');
    });

    await db.rollbackTransaction();

    await context.test('DB 재연결 시 기존 데이터 보존', async () => {
      const organizationId = (await database.query("INSERT INTO organizations (name, code) VALUES ('Persistence', '000125')")).insertId;
      await database.query(`INSERT INTO users (organization_id, username, password_hash) VALUES (${organizationId}, 'persist', 'test-hash')`);
      const reopened = await new DataSource(databaseOptions).initialize();

      try {
        const [row] = await reopened.query("SELECT COUNT(*) AS total FROM users WHERE username = 'persist'");
        assert.equal(Number(row.total), 1);
      }
      finally {
        await reopened.destroy();
        await database.query("DELETE FROM users WHERE username = 'persist'");
        await database.query('DELETE FROM organizations WHERE id = ?', [organizationId]);
      }
    });
  }
  finally {
    if (db.isTransactionActive) await db.rollbackTransaction();
    await db.release();
    await database.destroy();
  }
});
