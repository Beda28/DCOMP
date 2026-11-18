CREATE TABLE organizations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code CHAR(6) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  name VARCHAR(160) NOT NULL,
  status ENUM('ACTIVE','DISABLED') NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_organizations_code (code),
  CONSTRAINT ck_organizations_code CHECK (code REGEXP '^[0-9]{6}$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organization_id INT UNSIGNED NOT NULL,
  username VARCHAR(32) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('ADMIN','STAFF') NOT NULL DEFAULT 'STAFF',
  status ENUM('ACTIVE','DISABLED') NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_users_organization_id (organization_id, id),
  UNIQUE KEY uq_users_username (organization_id, username),
  CONSTRAINT fk_users_organization FOREIGN KEY (organization_id)
    REFERENCES organizations(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE auth_sessions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  family_id CHAR(36) NOT NULL,
  refresh_token_hash CHAR(64) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_auth_sessions_token (refresh_token_hash),
  KEY ix_auth_sessions_user_exp (user_id, expires_at),
  KEY ix_auth_sessions_family (family_id),
  CONSTRAINT fk_auth_sessions_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE partners (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organization_id INT UNSIGNED NOT NULL,
  name VARCHAR(160) NOT NULL,
  is_customer TINYINT(1) NOT NULL DEFAULT 0,
  is_supplier TINYINT(1) NOT NULL DEFAULT 0,
  biz_number VARCHAR(12) NULL,
  contact VARCHAR(120) NULL,
  email VARCHAR(254) NULL,
  status ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_partners_organization_id (organization_id, id),
  UNIQUE KEY uq_partners_biz_number (organization_id, biz_number),
  KEY ix_partners_status_name (organization_id, status, name),
  CONSTRAINT ck_partners_role CHECK (is_customer = 1 OR is_supplier = 1),
  CONSTRAINT ck_partners_flags CHECK (
    is_customer IN (0,1) AND is_supplier IN (0,1)
  ),
  CONSTRAINT fk_partners_organization FOREIGN KEY (organization_id)
    REFERENCES organizations(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organization_id INT UNSIGNED NOT NULL,
  sku VARCHAR(64) NOT NULL,
  name VARCHAR(160) NOT NULL,
  unit VARCHAR(20) NOT NULL DEFAULT 'EA',
  purchase_price DECIMAL(15,2) NULL,
  sale_price DECIMAL(15,2) NULL,
  status ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_items_organization_id (organization_id, id),
  UNIQUE KEY uq_items_sku (organization_id, sku),
  KEY ix_items_status_name (organization_id, status, name),
  CONSTRAINT ck_items_prices CHECK (
    (purchase_price IS NULL OR purchase_price >= 0)
    AND (sale_price IS NULL OR sale_price >= 0)
  ),
  CONSTRAINT fk_items_organization FOREIGN KEY (organization_id)
    REFERENCES organizations(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE transactions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organization_id INT UNSIGNED NOT NULL,
  number VARCHAR(48) NOT NULL,
  partner_id INT UNSIGNED NOT NULL,
  created_by INT UNSIGNED NOT NULL,
  type ENUM('PURCHASE','SALE') NOT NULL,
  occurred_at DATE NOT NULL,
  status ENUM('DRAFT','CONFIRMED','CANCELED') NOT NULL DEFAULT 'DRAFT',
  memo VARCHAR(1000) NULL,
  total_amount DECIMAL(20,2) NOT NULL DEFAULT 0,
  revision INT UNSIGNED NOT NULL DEFAULT 0,
  confirmed_at DATETIME(3) NULL,
  canceled_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_transactions_organization_id (organization_id, id),
  UNIQUE KEY uq_transactions_number (organization_id, number),
  KEY ix_transactions_partner_date (organization_id, partner_id, occurred_at),
  KEY ix_transactions_type_status_date (organization_id, type, status, occurred_at),
  CONSTRAINT fk_transactions_partner FOREIGN KEY (organization_id, partner_id)
    REFERENCES partners(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_transactions_user FOREIGN KEY (organization_id, created_by)
    REFERENCES users(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT ck_transactions_total CHECK (total_amount >= 0),
  CONSTRAINT fk_transactions_organization FOREIGN KEY (organization_id)
    REFERENCES organizations(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE transaction_lines (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organization_id INT UNSIGNED NOT NULL,
  transaction_id INT UNSIGNED NOT NULL,
  item_id INT UNSIGNED NOT NULL,
  position SMALLINT UNSIGNED NOT NULL,
  quantity DECIMAL(12,3) NOT NULL,
  unit_price DECIMAL(15,2) NOT NULL,
  line_amount DECIMAL(20,2) NOT NULL,
  item_sku_snapshot VARCHAR(64) NOT NULL,
  item_name_snapshot VARCHAR(160) NOT NULL,
  UNIQUE KEY uq_transaction_lines_position (transaction_id, position),
  UNIQUE KEY uq_transaction_lines_item (transaction_id, item_id),
  KEY ix_transaction_lines_item (organization_id, item_id),
  CONSTRAINT fk_transaction_lines_transaction FOREIGN KEY (organization_id, transaction_id)
    REFERENCES transactions(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_transaction_lines_item FOREIGN KEY (organization_id, item_id)
    REFERENCES items(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT ck_transaction_lines_values CHECK (
    quantity > 0 AND unit_price >= 0 AND line_amount >= 0
  ),
  CONSTRAINT fk_transaction_lines_organization FOREIGN KEY (organization_id)
    REFERENCES organizations(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE documents (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organization_id INT UNSIGNED NOT NULL,
  partner_id INT UNSIGNED NULL,
  transaction_id INT UNSIGNED NULL,
  uploaded_by INT UNSIGNED NOT NULL,
  upload_key VARCHAR(64) NULL,
  upload_request_hash CHAR(64) NULL,
  kind ENUM('RECEIPT','INVOICE','OTHER') NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  content_type VARCHAR(100) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL,
  storage_key VARCHAR(255) NOT NULL,
  sha256 CHAR(64) NOT NULL,
  status ENUM('UPLOADED','QUEUED','PROCESSING','READY','FAILED')
    NOT NULL DEFAULT 'UPLOADED',
  current_job_version INT UNSIGNED NOT NULL DEFAULT 0,
  revision INT UNSIGNED NOT NULL DEFAULT 0,
  ocr_text LONGTEXT NULL,
  corrected_text LONGTEXT NULL,
  extracted_json JSON NULL,
  corrected_json JSON NULL,
  processed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_documents_organization_id (organization_id, id),
  UNIQUE KEY uq_documents_storage_key (storage_key),
  UNIQUE KEY uq_documents_upload_key (uploaded_by, upload_key),
  KEY ix_documents_partner_status_date (organization_id, partner_id, status, created_at),
  KEY ix_documents_kind_status_date (organization_id, kind, status, created_at),
  KEY ix_documents_transaction (organization_id, transaction_id),
  KEY ix_documents_sha256 (organization_id, sha256),
  CONSTRAINT fk_documents_partner FOREIGN KEY (organization_id, partner_id)
    REFERENCES partners(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_documents_transaction FOREIGN KEY (organization_id, transaction_id)
    REFERENCES transactions(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_documents_uploader FOREIGN KEY (organization_id, uploaded_by)
    REFERENCES users(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT ck_documents_size CHECK (size_bytes > 0),
  CONSTRAINT ck_documents_upload_key_hash CHECK (
    (upload_key IS NULL AND upload_request_hash IS NULL)
    OR (upload_key IS NOT NULL AND upload_request_hash IS NOT NULL)
  ),
  CONSTRAINT fk_documents_organization FOREIGN KEY (organization_id)
    REFERENCES organizations(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE document_jobs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  document_id INT UNSIGNED NOT NULL,
  version INT UNSIGNED NOT NULL,
  bullmq_job_id VARCHAR(128) NOT NULL,
  status ENUM('PENDING_ENQUEUE','QUEUED','PROCESSING','COMPLETED','FAILED')
    NOT NULL DEFAULT 'PENDING_ENQUEUE',
  attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  error_code VARCHAR(64) NULL,
  error_message VARCHAR(500) NULL,
  started_at DATETIME(3) NULL,
  finished_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_document_jobs_version (document_id, version),
  UNIQUE KEY uq_document_jobs_bullmq_id (bullmq_job_id),
  KEY ix_document_jobs_status_updated (status, updated_at),
  CONSTRAINT fk_document_jobs_document FOREIGN KEY (document_id)
    REFERENCES documents(id) ON DELETE RESTRICT,
  CONSTRAINT ck_document_jobs_version CHECK (version > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE document_edits (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organization_id INT UNSIGNED NOT NULL,
  document_id INT UNSIGNED NOT NULL,
  editor_id INT UNSIGNED NOT NULL,
  revision INT UNSIGNED NOT NULL,
  before_json JSON NULL,
  after_json JSON NULL,
  before_text LONGTEXT NULL,
  after_text LONGTEXT NULL,
  edited_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_document_edits_revision (document_id, revision),
  KEY ix_document_edits_editor (organization_id, editor_id),
  CONSTRAINT fk_document_edits_document FOREIGN KEY (organization_id, document_id)
    REFERENCES documents(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_document_edits_editor FOREIGN KEY (organization_id, editor_id)
    REFERENCES users(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT ck_document_edits_revision CHECK (revision > 0),
  CONSTRAINT fk_document_edits_organization FOREIGN KEY (organization_id)
    REFERENCES organizations(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
