import { IsOptional, IsString, Length, Matches, ValidateIf } from 'class-validator';
import { nullableText, trim } from '../common/catalog.dto.js';
import { Transform }          from 'class-transformer';

class ItemFieldsDto {
  @ValidateIf((_, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @Length(1, 20)
  unit?: string;

  @Transform(nullableText)
  @IsOptional()
  @IsString()
  @Matches(/^(0|[1-9]\d{0,12})(\.\d{1,2})?$/)
  purchasePrice?: string | null;

  @Transform(nullableText)
  @IsOptional()
  @IsString()
  @Matches(/^(0|[1-9]\d{0,12})(\.\d{1,2})?$/)
  salePrice?: string | null;
}

export class CreateItemDto extends ItemFieldsDto {
  @Transform(trim)
  @IsString()
  @Length(1, 64)
  sku!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 160)
  name!: string;
}

export class UpdateItemDto extends ItemFieldsDto {
  @ValidateIf((_, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @Length(1, 64)
  sku?: string;

  @ValidateIf((_, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @Length(1, 160)
  name?: string;
}
