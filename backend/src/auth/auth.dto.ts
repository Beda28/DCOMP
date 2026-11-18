import { Transform }                 from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';

export class LoginDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsString()
  @Matches(/^[a-z0-9_]{3,32}$/)
  username!: string;

  @IsString()
  @Length(1, 256)
  password!: string;
}

export class SignupDto extends LoginDto {
  @Length(8, 256)
  declare password: string;
}
