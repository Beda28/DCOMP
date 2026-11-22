import { Entity, PrimaryColumn } from 'typeorm';

@Entity('transaction_reads')
export class TransactionRead {
  @PrimaryColumn({ name: 'organization_id', type: 'int', unsigned: true })
  organizationId!: number;

  @PrimaryColumn({ name: 'transaction_id', type: 'int', unsigned: true })
  transactionId!: number;

  @PrimaryColumn({ name: 'user_id', type: 'int', unsigned: true })
  userId!: number;
}
