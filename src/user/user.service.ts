import { Injectable } from '@nestjs/common';

import { CreateUserDto } from './dto/create-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UserRepository } from './user.repository';

@Injectable()
export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  async findAll(): Promise<UserResponseDto[]> {
    const users = await this.userRepository.findAll();

    return users.map((user) => UserResponseDto.fromRecord(user));
  }

  async create(payload: CreateUserDto): Promise<UserResponseDto> {
    const user = await this.userRepository.create(payload);

    return UserResponseDto.fromRecord(user);
  }
}
