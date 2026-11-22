import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type DocumentKind = 'RECEIPT' | 'INVOICE' | 'OTHER';
export type DocumentStatus = 'UPLOADED' | 'QUEUED' | 'PROCESSING' | 'READY' | 'FAILED';
export type DocumentFields = { date: string | null; amount: string | null; title: string | null; bizNumber: string | null };

@Entity('documents')
export class Document {
  @PrimaryGeneratedColumn({ unsigned: true })
  id!: number;

  @Column({ name: 'organization_id', type: 'int', unsigned: true })
  organizationId!: number;

  @Column({ name: 'partner_id', type: 'int', unsigned: true, nullable: true })
  partnerId!: number | null;

  @Column({ name: 'transaction_id', type: 'int', unsigned: true, nullable: true })
  transactionId!: number | null;

  @Column({ name: 'uploaded_by', type: 'int', unsigned: true })
  uploadedBy!: number;

  @Column({ name: 'upload_key', type: 'varchar', length: 64, nullable: true, select: false })
  uploadKey!: string | null;

  @Column({ name: 'upload_request_hash', type: 'char', length: 64, nullable: true, select: false })
  uploadRequestHash!: string | null;

  @Column({ type: 'enum', enum: ['RECEIPT', 'INVOICE', 'OTHER'] })
  kind!: DocumentKind;

  @Column({ name: 'original_filename', length: 255 })
  originalFilename!: string;

  @Column({ name: 'content_type', length: 100 })
  contentType!: string;

  @Column({ name: 'size_bytes', type: 'bigint', unsigned: true })
  sizeBytes!: string;

  @Column({ name: 'storage_key', length: 255, select: false })
  storageKey!: string;

  @Column({ length: 64 })
  sha256!: string;

  @Column({ type: 'enum', enum: ['UPLOADED', 'QUEUED', 'PROCESSING', 'READY', 'FAILED'], default: 'UPLOADED' })
  status!: DocumentStatus;

  @Column({ name: 'current_job_version', type: 'int', unsigned: true, default: 0 })
  currentJobVersion!: number;

  @Column({ type: 'int', unsigned: true, default: 0 })
  revision!: number;

  @Column({ name: 'ocr_text', type: 'longtext', nullable: true })
  ocrText!: string | null;

  @Column({ name: 'corrected_text', type: 'longtext', nullable: true })
  correctedText!: string | null;

  @Column({ name: 'extracted_json', type: 'json', nullable: true })
  extractedJson!: DocumentFields | null;

  @Column({ name: 'corrected_json', type: 'json', nullable: true })
  correctedJson!: DocumentFields | null;

  @Column({ name: 'processed_at', type: 'datetime', precision: 3, nullable: true })
  processedAt!: Date | null;

  @Column({ name: 'created_at', type: 'datetime', precision: 3, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'datetime', precision: 3, default: () => 'CURRENT_TIMESTAMP(3)', onUpdate: 'CURRENT_TIMESTAMP(3)' })
  updatedAt!: Date;
}
