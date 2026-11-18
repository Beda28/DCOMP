import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('partners')
export class Partner {
  @PrimaryGeneratedColumn({ unsigned: true })
  id!: number;

  @Column({ name: 'organization_id', type: 'int', unsigned: true })
  organizationId!: number;

  @Column({ length: 160 })
  name!: string;

  @Column({ name: 'is_customer', type: 'boolean', default: false })
  isCustomer!: boolean;

  @Column({ name: 'is_supplier', type: 'boolean', default: false })
  isSupplier!: boolean;

  @Column({ name: 'biz_number', type: 'varchar', length: 12, nullable: true })
  bizNumber!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  contact!: string | null;

  @Column({ type: 'varchar', length: 254, nullable: true })
  email!: string | null;

  @Column({ type: 'enum', enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' })
  status!: 'ACTIVE' | 'INACTIVE';
}
