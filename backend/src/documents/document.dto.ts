import { IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { integer, nullableText, SearchQueryDto } from '../common/catalog.dto.js';
import type { DocumentKind, DocumentStatus } from './document.entity.js';

export class DocumentLinksDto {
  @IsOptional()
  @Transform(integer)
  @IsInt()
  @Min(1)
  @Max(4294967295)
  partnerId?: number | null;

  @IsOptional()
  @Transform(integer)
  @IsInt()
  @Min(1)
  @Max(4294967295)
  transactionId?: number | null;
}

export class UploadDocumentDto extends DocumentLinksDto {
  @IsIn(['RECEIPT', 'INVOICE', 'OTHER'])
  kind!: DocumentKind;
}

export class RevisionDto {
  @IsInt()
  @Min(0)
  @Max(4294967294)
  expectedRevision!: number;
}

export class LinkDocumentDto extends DocumentLinksDto {
  @IsInt()
  @Min(0)
  @Max(4294967294)
  expectedRevision!: number;
}

export class FieldsDto {
  @IsOptional()
  @Matches(/^[1-9]\d{3}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  date!: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^(0|[1-9]\d{0,17})(\.\d{1,2})?$/)
  amount!: string | null;

  @Transform(nullableText)
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title!: string | null;

  @IsOptional()
  @Matches(/^\d{3}-\d{2}-\d{5}$/)
  bizNumber!: string | null;
}

export class CorrectDocumentDto extends RevisionDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(100000)
  correctedText?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => FieldsDto)
  correctedJson?: FieldsDto;
}

export class DocumentQueryDto extends SearchQueryDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsIn(['RECEIPT', 'INVOICE', 'OTHER'])
  kind?: DocumentKind;

  @ValidateIf((_, value) => value !== undefined)
  @IsIn(['UPLOADED', 'QUEUED', 'PROCESSING', 'READY', 'FAILED'])
  status?: DocumentStatus;

  @ValidateIf((_, value) => value !== undefined)
  @Transform(integer)
  @IsInt()
  @Min(1)
  @Max(4294967295)
  partnerId?: number;

  @ValidateIf((_, value) => value !== undefined)
  @Transform(integer)
  @IsInt()
  @Min(1)
  @Max(4294967295)
  transactionId?: number;

  @ValidateIf((_, value) => value !== undefined)
  @Matches(/^[1-9]\d{3}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  from?: string;

  @ValidateIf((_, value) => value !== undefined)
  @Matches(/^[1-9]\d{3}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  to?: string;
}
