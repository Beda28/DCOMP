import { Transform } from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';
import { trim }      from '../common/catalog.dto.js';

export class CredentialsDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsString()
  @Matches(/^[a-z0-9_]{3,32}$/)
  username!: string;

  @IsString()
  @Length(8, 256)
  password!: string;
}

export class LoginDto {
  @Transform(trim)
  @IsString()
  @Matches(/^\d{6}$/)
  companyCode!: string;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsString()
  @Matches(/^[a-z0-9_]{3,32}$/)
  username!: string;

  @IsString()
  @Length(1, 256)
  password!: string;
}
