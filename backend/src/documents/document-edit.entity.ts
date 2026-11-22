import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { DocumentFields } from './document.entity.js';

@Entity('document_edits')
export class DocumentEdit {
  @PrimaryGeneratedColumn({ unsigned: true })
  id!: number;

  @Column({ name: 'organization_id', type: 'int', unsigned: true })
  organizationId!: number;

  @Column({ name: 'document_id', type: 'int', unsigned: true })
  documentId!: number;

  @Column({ name: 'editor_id', type: 'int', unsigned: true })
  editorId!: number;

  @Column({ type: 'int', unsigned: true })
  revision!: number;

  @Column({ name: 'before_json', type: 'json', nullable: true })
  beforeJson!: DocumentFields | null;

  @Column({ name: 'after_json', type: 'json', nullable: true })
  afterJson!: DocumentFields | null;

  @Column({ name: 'before_text', type: 'longtext', nullable: true })
  beforeText!: string | null;

  @Column({ name: 'after_text', type: 'longtext', nullable: true })
  afterText!: string | null;

  @Column({ name: 'edited_at', type: 'datetime', precision: 3, default: () => 'CURRENT_TIMESTAMP(3)' })
  editedAt!: Date;
}
