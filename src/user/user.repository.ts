import { Injectable } from '@nestjs/common';

import type { CreateUserDto } from './dto/create-user.dto';

export interface UserRecord {
  createdAt: Date;
  email: string;
  id: string;
  userName: string;
}

@Injectable()
export class UserRepository {
  private readonly users: UserRecord[] = [
    {
      createdAt: new Date('2026-03-11T10:00:00.000Z'),
      email: 'admin@h2biz.co.kr',
      id: '1',
      userName: 'Admin User',
    },
  ];

  findAll(): Promise<UserRecord[]> {
    return Promise.resolve([...this.users]);
  }

  create(payload: CreateUserDto): Promise<UserRecord> {
    const nextUser: UserRecord = {
      createdAt: new Date(),
      email: payload.email,
      id: String(this.users.length + 1),
      userName: payload.userName,
    };

    this.users.push(nextUser);

    return Promise.resolve(nextUser);
  }
}
