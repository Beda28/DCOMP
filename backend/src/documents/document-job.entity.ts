import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('document_jobs')
export class DocumentJob {
  @PrimaryGeneratedColumn({ unsigned: true })
  id!: number;

  @Column({ name: 'document_id', type: 'int', unsigned: true })
  documentId!: number;

  @Column({ type: 'int', unsigned: true })
  version!: number;

  @Column({ name: 'bullmq_job_id', length: 128 })
  bullmqJobId!: string;

  @Column({ type: 'enum', enum: ['PENDING_ENQUEUE', 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED'], default: 'PENDING_ENQUEUE' })
  status!: 'PENDING_ENQUEUE' | 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

  @Column({ type: 'smallint', unsigned: true, default: 0 })
  attempts!: number;

  @Column({ name: 'error_code', type: 'varchar', length: 64, nullable: true })
  errorCode!: string | null;

  @Column({ name: 'error_message', type: 'varchar', length: 500, nullable: true })
  errorMessage!: string | null;

  @Column({ name: 'started_at', type: 'datetime', precision: 3, nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'finished_at', type: 'datetime', precision: 3, nullable: true })
  finishedAt!: Date | null;

  @Column({ name: 'created_at', type: 'datetime', precision: 3, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'datetime', precision: 3, default: () => 'CURRENT_TIMESTAMP(3)', onUpdate: 'CURRENT_TIMESTAMP(3)' })
  updatedAt!: Date;
}
