import { IsIn, IsString, Length, ValidateIf } from 'class-validator';
import { CredentialsDto } from '../auth/auth.dto.js';
import { SearchQueryDto } from '../common/catalog.dto.js';

export class CreateUserDto extends CredentialsDto {}

export class UpdateUserDto {
  @IsIn(['ACTIVE', 'DISABLED'])
  status!: 'ACTIVE' | 'DISABLED';
}

export class ResetPasswordDto {
  @IsString()
  @Length(8, 256)
  newPassword!: string;
}

export class UserQueryDto extends SearchQueryDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsIn(['ACTIVE', 'DISABLED'])
  status?: 'ACTIVE' | 'DISABLED';
}
