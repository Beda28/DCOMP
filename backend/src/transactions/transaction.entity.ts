import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Partner }              from '../partners/partner.entity.js';
import { User }                 from '../auth/user.entity.js';
import type { TransactionRead } from './transaction-read.entity.js';

export type TransactionType = 'PURCHASE' | 'SALE';
export type TransactionStatus = 'DRAFT' | 'CONFIRMED' | 'CANCELED';

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn({ unsigned: true })
  id!: number;

  @Column({ name: 'organization_id', type: 'int', unsigned: true })
  organizationId!: number;

  @Column({ length: 16 })
  number!: string;

  @Column({ name: 'partner_id', type: 'int', unsigned: true })
  partnerId!: number;

  @ManyToOne(() => Partner)
  @JoinColumn([
    { name: 'organization_id', referencedColumnName: 'organizationId' },
    { name: 'partner_id', referencedColumnName: 'id' },
  ])
  partner!: Partner;

  @Column({ name: 'created_by', type: 'int', unsigned: true })
  createdBy!: number;

  @ManyToOne(() => User)
  @JoinColumn([
    { name: 'organization_id', referencedColumnName: 'organizationId' },
    { name: 'created_by', referencedColumnName: 'id' },
  ])
  creator!: User;

  @Column({ name: 'assignee_id', type: 'int', unsigned: true })
  assigneeId!: number;

  @ManyToOne(() => User)
  @JoinColumn([
    { name: 'organization_id', referencedColumnName: 'organizationId' },
    { name: 'assignee_id', referencedColumnName: 'id' },
  ])
  assignee!: User;

  read?: TransactionRead;

  @Column({ type: 'enum', enum: ['PURCHASE', 'SALE'] })
  type!: TransactionType;

  @Column({ name: 'occurred_at', type: 'date' })
  occurredAt!: string;

  @Column({ type: 'enum', enum: ['DRAFT', 'CONFIRMED', 'CANCELED'], default: 'DRAFT' })
  status!: TransactionStatus;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  memo!: string | null;

  @Column({ name: 'total_amount', type: 'decimal', precision: 20, scale: 2, default: 0 })
  totalAmount!: string;

  @Column({ type: 'int', unsigned: true, default: 0 })
  revision!: number;

  @Column({ name: 'confirmed_at', type: 'datetime', precision: 3, nullable: true })
  confirmedAt!: Date | null;

  @Column({ name: 'canceled_at', type: 'datetime', precision: 3, nullable: true })
  canceledAt!: Date | null;

  @Column({ name: 'created_at', type: 'datetime', precision: 3, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'datetime', precision: 3, default: () => 'CURRENT_TIMESTAMP(3)', onUpdate: 'CURRENT_TIMESTAMP(3)' })
  updatedAt!: Date;
}
