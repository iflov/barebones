import { Body, Controller, Get, Post, Version } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CreateUserDto } from './dto/create-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UserService } from './user.service';

@ApiTags('users')
@Controller('admin/users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @Version('1')
  @ApiOperation({ summary: 'User 목록 조회' })
  @ApiOkResponse({ type: UserResponseDto, isArray: true })
  async findAll(): Promise<UserResponseDto[]> {
    return this.userService.findAll();
  }

  @Post()
  @Version('1')
  @ApiOperation({ summary: 'User 생성' })
  @ApiCreatedResponse({ type: UserResponseDto })
  async create(@Body() payload: CreateUserDto): Promise<UserResponseDto> {
    return this.userService.create(payload);
  }
}
