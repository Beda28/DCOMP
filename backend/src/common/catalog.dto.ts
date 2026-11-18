import { IsIn, IsInt, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';

export const trim = ({ value }: { value: unknown }): unknown => typeof value === 'string' ? value.trim() : value;

export const nullableText = ({ value }: { value: unknown }): unknown => (
  typeof value === 'string' ? value.trim() || null : value
);

const integer = ({ value }: { value: unknown }): unknown => (
  typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value
);

export class ListQueryDto {
  @Transform(integer)
  @IsInt()
  @Min(1)
  @Max(1000000)
  page = 1;

  @Transform(integer)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ValidateIf((_, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @MaxLength(160)
  q?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
}

export class RecordIdDto {
  @Transform(integer)
  @IsInt()
  @Min(1)
  @Max(4294967295)
  id!: number;
}
