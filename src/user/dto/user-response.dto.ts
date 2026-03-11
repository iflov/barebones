import { ApiProperty } from '@nestjs/swagger';

import { toIsoString } from '../../common/utils/date.util';
import type { UserRecord } from '../user.repository';

export class UserResponseDto {
  @ApiProperty({ example: '1' })
  readonly id!: string;

  @ApiProperty({ example: 'admin@h2biz.co.kr' })
  readonly email!: string;

  @ApiProperty({ example: 'Barebones Admin' })
  readonly userName!: string;

  @ApiProperty({ example: '2026-03-11T10:00:00.000Z' })
  readonly createdAt!: string;

  static fromRecord(record: UserRecord): UserResponseDto {
    return {
      createdAt: toIsoString(record.createdAt),
      email: record.email,
      id: record.id,
      userName: record.userName,
    };
  }
}
