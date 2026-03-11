import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'admin@h2biz.co.kr' })
  @IsEmail()
  readonly email!: string;

  @ApiProperty({ example: 'Barebones Admin' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  readonly userName!: string;
}
