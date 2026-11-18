import { IsString, Length } from 'class-validator';
import { Transform }        from 'class-transformer';
import { CredentialsDto }   from '../auth/auth.dto.js';
import { trim }             from '../common/catalog.dto.js';

export class RegisterOrganizationDto extends CredentialsDto {
  @Transform(trim)
  @IsString()
  @Length(1, 160)
  companyName!: string;
}
