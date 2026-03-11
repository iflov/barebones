import { Test } from '@nestjs/testing';

import { UserRepository } from './user.repository';
import { UserService } from './user.service';

describe('UserService', () => {
  let userService: UserService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [UserRepository, UserService],
    }).compile();

    userService = moduleRef.get(UserService);
  });

  it('returns seeded users with dayjs formatted dates', async () => {
    const users = await userService.findAll();

    expect(users).toHaveLength(1);
    expect(users[0]?.createdAt).toBe('2026-03-11T10:00:00.000Z');
  });

  it('creates a user through the repository layer', async () => {
    const user = await userService.create({
      email: 'new.user@h2biz.co.kr',
      userName: 'New User',
    });

    expect(user.id).toBe('2');
    expect(user.email).toBe('new.user@h2biz.co.kr');
  });
});
