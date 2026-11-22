import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('transaction_lines')
export class TransactionLine {
  @PrimaryGeneratedColumn({ unsigned: true })
  id!: number;

  @Column({ name: 'organization_id', type: 'int', unsigned: true })
  organizationId!: number;

  @Column({ name: 'transaction_id', type: 'int', unsigned: true })
  transactionId!: number;

  @Column({ name: 'item_id', type: 'int', unsigned: true })
  itemId!: number;

  @Column({ type: 'smallint', unsigned: true })
  position!: number;

  @Column({ type: 'decimal', precision: 12, scale: 3 })
  quantity!: string;

  @Column({ name: 'unit_price', type: 'decimal', precision: 15, scale: 2 })
  unitPrice!: string;

  @Column({ name: 'line_amount', type: 'decimal', precision: 20, scale: 2 })
  lineAmount!: string;

  @Column({ name: 'item_sku_snapshot', length: 64 })
  itemSkuSnapshot!: string;

  @Column({ name: 'item_name_snapshot', length: 160 })
  itemNameSnapshot!: string;
}
