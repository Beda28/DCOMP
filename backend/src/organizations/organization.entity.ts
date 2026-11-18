import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('organizations')
export class Organization {
  @PrimaryGeneratedColumn({ unsigned: true })
  id!: number;

  @Column({ type: 'char', length: 6 })
  code!: string;

  @Column({ length: 160 })
  name!: string;

  @Column({ type: 'enum', enum: ['ACTIVE', 'DISABLED'], default: 'ACTIVE' })
  status!: 'ACTIVE' | 'DISABLED';
}
