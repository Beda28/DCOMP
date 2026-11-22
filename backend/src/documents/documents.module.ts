import { Module }              from '@nestjs/common';
import { TypeOrmModule }       from '@nestjs/typeorm';
import { AuthModule }          from '../auth/auth.module.js';
import { Document }            from './document.entity.js';
import { DocumentJob }         from './document-job.entity.js';
import { DocumentEdit }        from './document-edit.entity.js';
import { DocumentWorker }      from './document-worker.service.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService }    from './documents.service.js';
import { StorageService }      from './storage.service.js';

@Module({
  imports:     [AuthModule, TypeOrmModule.forFeature([Document, DocumentJob, DocumentEdit])],
  controllers: [DocumentsController],
  providers:   [DocumentsService, StorageService, DocumentWorker],
  exports:     [DocumentsService],
})
export class DocumentsModule {}
