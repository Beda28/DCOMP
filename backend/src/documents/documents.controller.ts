import { Body, Controller, Get, Header, Headers, HttpCode, Param, Patch, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { CorrectDocumentDto, DocumentQueryDto, LinkDocumentDto, RevisionDto, UploadDocumentDto } from './document.dto.js';
import { FileInterceptor }           from '@nestjs/platform-express';
import { AuthGuard, type AuthRequest } from '../auth/auth.guard.js';
import { OriginGuard }               from '../auth/origin.guard.js';
import { RecordIdDto }               from '../common/catalog.dto.js';
import { DocumentsService }          from './documents.service.js';

@Controller('documents')
@UseGuards(AuthGuard, OriginGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Req() request: AuthRequest, @Query() query: DocumentQueryDto) { return this.documents.list(request.user, query); }

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 3, fieldSize: 1024 } }))
  upload(@Req() request: AuthRequest, @Body() body: UploadDocumentDto, @UploadedFile() file: Express.Multer.File | undefined,
    @Headers('idempotency-key') key?: string) { return this.documents.upload(request.user, body, file, key); }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  get(@Req() request: AuthRequest, @Param() { id }: RecordIdDto) { return this.documents.get(request.user, id); }

  @Get(':id/file')
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  file(@Req() request: AuthRequest, @Param() { id }: RecordIdDto) { return this.documents.download(request.user, id); }

  @Get(':id/edits')
  @Header('Cache-Control', 'no-store')
  history(@Req() request: AuthRequest, @Param() { id }: RecordIdDto, @Query() query: DocumentQueryDto) { return this.documents.history(request.user, id, query); }

  @Patch(':id/links')
  link(@Req() request: AuthRequest, @Param() { id }: RecordIdDto, @Body() body: LinkDocumentDto) { return this.documents.link(request.user, id, body); }

  @Patch(':id/corrections')
  correct(@Req() request: AuthRequest, @Param() { id }: RecordIdDto, @Body() body: CorrectDocumentDto) { return this.documents.correct(request.user, id, body); }

  @Post(':id/retry')
  @HttpCode(200)
  retry(@Req() request: AuthRequest, @Param() { id }: RecordIdDto, @Body() body: RevisionDto) { return this.documents.retry(request.user, id, body.expectedRevision); }
}
