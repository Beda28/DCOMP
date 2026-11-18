import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn({ unsigned: true })
  id!: number;

  @Column({ length: 32 })
  username!: string;

  @Column({ name: 'password_hash', length: 255, select: false })
  passwordHash!: string;

  @Column({ type: 'enum', enum: ['ADMIN', 'STAFF'], default: 'STAFF' })
  role!: 'ADMIN' | 'STAFF';

  @Column({ type: 'enum', enum: ['ACTIVE', 'DISABLED'], default: 'ACTIVE' })
  status!: 'ACTIVE' | 'DISABLED';
}

export type Profile = Pick<User, 'id' | 'username' | 'role' | 'status'>;
