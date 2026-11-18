import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('items')
export class Item {
  @PrimaryGeneratedColumn({ unsigned: true })
  id!: number;

  @Column({ length: 64 })
  sku!: string;

  @Column({ length: 160 })
  name!: string;

  @Column({ length: 20, default: 'EA' })
  unit!: string;

  @Column({ name: 'purchase_price', type: 'decimal', precision: 15, scale: 2, nullable: true })
  purchasePrice!: string | null;

  @Column({ name: 'sale_price', type: 'decimal', precision: 15, scale: 2, nullable: true })
  salePrice!: string | null;

  @Column({ type: 'enum', enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' })
  status!: 'ACTIVE' | 'INACTIVE';
}
