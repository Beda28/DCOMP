import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsEmail, IsIn, IsOptional, IsString, Length, Matches, MaxLength, ValidateIf } from 'class-validator';
import { ListQueryDto, nullableText, trim } from '../common/catalog.dto.js';
import { Transform } from 'class-transformer';

export type PartnerRole = 'CUSTOMER' | 'SUPPLIER';

const bizNumber = (input: { value: unknown }): unknown => {
  const value = nullableText(input);
  return typeof value === 'string' && /^\d{10}$/.test(value) ? value.replace(/^(\d{3})(\d{2})(\d{5})$/, '$1-$2-$3') : value;
};

class PartnerFieldsDto {
  @Transform(bizNumber)
  @IsOptional()
  @Matches(/^\d{3}-\d{2}-\d{5}$/)
  bizNumber?: string | null;

  @Transform(nullableText)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  contact?: string | null;

  @Transform(nullableText)
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string | null;
}

export class CreatePartnerDto extends PartnerFieldsDto {
  @Transform(trim)
  @IsString()
  @Length(1, 160)
  name!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2)
  @ArrayUnique()
  @IsIn(['CUSTOMER', 'SUPPLIER'], { each: true })
  roles!: PartnerRole[];
}

export class UpdatePartnerDto extends PartnerFieldsDto {
  @ValidateIf((_, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @Length(1, 160)
  name?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2)
  @ArrayUnique()
  @IsIn(['CUSTOMER', 'SUPPLIER'], { each: true })
  roles?: PartnerRole[];
}

export class PartnerQueryDto extends ListQueryDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsIn(['CUSTOMER', 'SUPPLIER'])
  role?: PartnerRole;
}
