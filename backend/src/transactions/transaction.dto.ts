import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { SearchQueryDto, integer, nullableText } from '../common/catalog.dto.js';
import type { TransactionStatus, TransactionType } from './transaction.entity.js';
import { Transform, Type } from 'class-transformer';

export class TransactionLineDto {
  @IsInt()
  @Min(1)
  @Max(4294967295)
  itemId!: number;

  @IsString()
  @Matches(/^(?!0(?:\.0{1,3})?$)(0|[1-9]\d{0,8})(\.\d{1,3})?$/)
  quantity!: string;

  @IsString()
  @Matches(/^(0|[1-9]\d{0,12})(\.\d{1,2})?$/)
  unitPrice!: string;
}

class TransactionMemoDto {
  @Transform(nullableText)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  memo?: string | null;
}

export class CreateTransactionDto extends TransactionMemoDto {
  @IsIn(['PURCHASE', 'SALE'])
  type!: TransactionType;

  @IsInt()
  @Min(1)
  @Max(4294967295)
  partnerId!: number;

  @Matches(/^[1-9]\d{3}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  occurredAt!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique((line: TransactionLineDto) => line?.itemId)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => TransactionLineDto)
  lines!: TransactionLineDto[];
}

export class UpdateTransactionDto extends TransactionMemoDto {
  @IsInt()
  @Min(0)
  @Max(4294967294)
  expectedRevision!: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsIn(['PURCHASE', 'SALE'])
  type?: TransactionType;

  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(4294967295)
  partnerId?: number;

  @ValidateIf((_, value) => value !== undefined)
  @Matches(/^[1-9]\d{3}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  occurredAt?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique((line: TransactionLineDto) => line?.itemId)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => TransactionLineDto)
  lines?: TransactionLineDto[];
}

export class TransactionQueryDto extends SearchQueryDto {
  @ValidateIf((_, value) => value !== undefined)
  @Transform(integer)
  @IsInt()
  @Min(1)
  @Max(4294967295)
  assigneeId?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsIn(['PURCHASE', 'SALE'])
  type?: TransactionType;

  @ValidateIf((_, value) => value !== undefined)
  @IsIn(['DRAFT', 'CONFIRMED', 'CANCELED'])
  status?: TransactionStatus;

  @ValidateIf((_, value) => value !== undefined)
  @Transform(integer)
  @IsInt()
  @Min(1)
  @Max(4294967295)
  partnerId?: number;

  @ValidateIf((_, value) => value !== undefined)
  @Matches(/^[1-9]\d{3}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  from?: string;

  @ValidateIf((_, value) => value !== undefined)
  @Matches(/^[1-9]\d{3}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  to?: string;
}

export class AssignTransactionDto {
  @IsInt()
  @Min(0)
  @Max(4294967294)
  expectedRevision!: number;

  @IsInt()
  @Min(1)
  @Max(4294967295)
  assigneeId!: number;
}
