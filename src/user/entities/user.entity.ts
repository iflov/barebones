import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'user' })
export class UserEntity {
  @PrimaryGeneratedColumn({
    type: 'bigint',
  })
  id!: string;

  @Column({ name: 'email', length: 255, unique: true })
  email!: string;

  @Column({ name: 'user_name', length: 100 })
  userName!: string;

  @CreateDateColumn({
    name: 'created_at',
    type: 'datetime',
  })
  createdAt!: Date;
}
