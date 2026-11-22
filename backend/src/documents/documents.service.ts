import { Injectable, Logger, StreamableFile } from '@nestjs/common';
import { DataSource, QueryFailedError, type EntityManager } from 'typeorm';
import { createHash }        from 'node:crypto';
import type { Profile }      from '../auth/user.entity.js';
import { apiError }          from '../common/api-error.js';
import { requireChanges, searchPattern } from '../common/catalog.js';
import { Partner }           from '../partners/partner.entity.js';
import { Transaction }       from '../transactions/transaction.entity.js';
import { Document }          from './document.entity.js';
import { DocumentJob }       from './document-job.entity.js';
import { DocumentEdit }      from './document-edit.entity.js';
import { StorageService }    from './storage.service.js';
import { processingEnabled } from '../common/processing.js';
import type { CorrectDocumentDto, DocumentQueryDto, LinkDocumentDto, UploadDocumentDto } from './document.dto.js';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(private readonly database: DataSource, private readonly storage: StorageService) {}

  query(db: EntityManager, actor: Profile) {
    const query = db.createQueryBuilder(Document, 'document')
      .where('document.organization_id = :organizationId', { organizationId: actor.organizationId });
    if (actor.role !== 'ADMIN') {
      query.andWhere(`((document.transaction_id IS NULL AND document.uploaded_by = :actorId) OR EXISTS (
        SELECT 1 FROM transactions t WHERE t.id = document.transaction_id
        AND t.organization_id = document.organization_id AND t.assignee_id = :actorId
      ))`, { actorId: actor.id });
    }
    return query;
  }

  async find(db: EntityManager, actor: Profile, id: number, lock = false): Promise<Document> {
    const query = this.query(db, actor).andWhere('document.id = :id', { id });
    if (lock) query.setLock('pessimistic_write');
    const document = await query.getOne();
    if (!document) throw apiError(404, 'DOCUMENT_NOT_FOUND', '문서를 찾을 수 없습니다.');
    return document;
  }

  filters(actor: Profile, query: DocumentQueryDto) {
    if (query.from && query.to && query.from > query.to) throw apiError(400, 'VALIDATION_ERROR', '조회 시작일과 종료일을 확인해주세요.');
    const builder = this.query(this.database.manager, actor);
    if (query.kind)          builder.andWhere('document.kind = :kind', { kind: query.kind });
    if (query.status)        builder.andWhere('document.status = :status', { status: query.status });
    if (query.partnerId)     builder.andWhere('document.partner_id = :partnerId', { partnerId: query.partnerId });
    if (query.transactionId) builder.andWhere('document.transaction_id = :transactionId', { transactionId: query.transactionId });
    if (query.from)          builder.andWhere('document.created_at >= :from', { from: query.from });
    if (query.to)            builder.andWhere('document.created_at < DATE_ADD(:to, INTERVAL 1 DAY)', { to: query.to });
    return builder;
  }

  async list(actor: Profile, query: DocumentQueryDto) {
    const builder = this.filters(actor, query);
    if (query.q) builder.andWhere("(document.original_filename LIKE :q ESCAPE '=' OR COALESCE(document.corrected_text, document.ocr_text) LIKE :q ESCAPE '=')", { q: searchPattern(query.q) });
    builder.select(['document.id', 'document.organizationId', 'document.partnerId', 'document.transactionId', 'document.uploadedBy',
      'document.kind', 'document.originalFilename', 'document.contentType', 'document.sizeBytes', 'document.status', 'document.revision', 'document.createdAt']);
    const [data, total] = await builder.orderBy('document.id', 'DESC').skip((query.page - 1) * query.limit).take(query.limit).getManyAndCount();
    return { data, meta: { page: query.page, limit: query.limit, total } };
  }

  async get(actor: Profile, id: number) {
    return this.database.transaction(async db => {
      const document = await this.find(db, actor, id);
      const jobs = await db.find(DocumentJob, { where: { documentId: id }, order: { version: 'DESC' }, take: 20 });
      return { data: { ...document, jobs } };
    });
  }

  private checkRevision(document: Document, expectedRevision: number): void {
    if (document.revision !== expectedRevision) throw apiError(409, 'REVISION_CONFLICT', '다른 사용자가 수정한 문서입니다. 새로 불러온 뒤 다시 시도해주세요.');
  }

  private async links(db: EntityManager, actor: Profile, partnerId: number | null, transactionId: number | null) {
    if (transactionId) {
      const transaction = await db.findOne(Transaction, {
        where: { id: transactionId, organizationId: actor.organizationId, ...(actor.role === 'ADMIN' ? {} : { assigneeId: actor.id }) },
        lock: { mode: 'pessimistic_read' },
      });
      if (!transaction) throw apiError(404, 'TRANSACTION_NOT_FOUND', '거래를 찾을 수 없습니다.');
      if (partnerId && partnerId !== transaction.partnerId) throw apiError(422, 'PARTNER_MISMATCH', '거래와 같은 거래처를 선택해주세요.');
      partnerId = transaction.partnerId;
    }
    if (partnerId && !await db.existsBy(Partner, { id: partnerId, organizationId: actor.organizationId })) {
      throw apiError(404, 'PARTNER_NOT_FOUND', '거래처를 찾을 수 없습니다.');
    }
    return { partnerId, transactionId };
  }

  private async duplicate(actor: Profile, key: string, hash: string): Promise<number | null> {
    const document = await this.database.getRepository(Document).createQueryBuilder('document')
      .addSelect('document.uploadRequestHash')
      .where('document.organization_id = :organizationId AND document.uploaded_by = :userId AND document.upload_key = :key',
        { organizationId: actor.organizationId, userId: actor.id, key }).getOne();
    if (!document) return null;
    if (document.uploadRequestHash !== hash) throw apiError(409, 'UPLOAD_KEY_CONFLICT', '이미 다른 업로드에 사용된 요청 키입니다.');
    await this.find(this.database.manager, actor, document.id);
    return document.id;
  }

  async upload(actor: Profile, input: UploadDocumentDto, file: Express.Multer.File | undefined, key?: string) {
    if (key !== undefined && !/^[a-zA-Z0-9_-]{8,64}$/.test(key)) throw apiError(400, 'VALIDATION_ERROR', '업로드 요청 키를 확인해주세요.');
    const metadata = this.storage.inspect(file);
    const requestHash = createHash('sha256').update(JSON.stringify([metadata, input.kind, input.partnerId ?? null, input.transactionId ?? null])).digest('hex');
    if (key) {
      const id = await this.duplicate(actor, key, requestHash);
      if (id) return this.get(actor, id);
    }
    const storageKey = await this.storage.save(actor.organizationId, file!.buffer);
    let id: number;
    try {
      id = await this.database.transaction(async db => {
        const links = await this.links(db, actor, input.partnerId ?? null, input.transactionId ?? null);
        const document = await db.save(Document, db.create(Document, {
          ...metadata, ...links, organizationId: actor.organizationId, uploadedBy: actor.id,
          kind: input.kind, storageKey, uploadKey: key ?? null, uploadRequestHash: key ? requestHash : null,
          currentJobVersion: processingEnabled() ? 1 : 0,
        }));
        if (processingEnabled()) await this.job(db, document.id, 1);
        return document.id;
      });
    }
    catch (error) {
      await this.storage.remove(storageKey).catch(() => this.logger.error('실패한 업로드의 파일 정리에 실패했습니다.'));
      if (key && error instanceof QueryFailedError && error.driverError.code === 'ER_DUP_ENTRY') {
        const existing = await this.duplicate(actor, key, requestHash);
        if (existing) return this.get(actor, existing);
      }
      throw error;
    }
    return this.get(actor, id);
  }

  private async job(db: EntityManager, documentId: number, version: number): Promise<void> {
    await db.insert(DocumentJob, { documentId, version, bullmqJobId: `document-${documentId}-${version}` });
  }

  async retry(actor: Profile, id: number, expectedRevision: number) {
    await this.database.transaction(async db => {
      const document = await this.find(db, actor, id, true);
      this.checkRevision(document, expectedRevision);
      if (!processingEnabled()) throw apiError(501, 'PROCESSING_DISABLED', 'OCR은 개발 보류 상태입니다. 문서는 직접 입력할 수 있습니다.');
      if (document.currentJobVersion > 0 && !['READY', 'FAILED'].includes(document.status)) throw apiError(409, 'DOCUMENT_BUSY', '이미 처리 중인 문서입니다.');
      const version = document.currentJobVersion + 1;
      await this.job(db, id, version);
      await db.update(Document, id, { status: 'UPLOADED', currentJobVersion: version, revision: document.revision + 1 });
    });
    return this.get(actor, id);
  }

  async link(actor: Profile, id: number, input: LinkDocumentDto) {
    requireChanges({ partnerId: input.partnerId, transactionId: input.transactionId });
    await this.database.transaction(async db => {
      const document = await this.find(db, actor, id, true);
      this.checkRevision(document, input.expectedRevision);
      if (actor.role !== 'ADMIN' && input.transactionId === null && document.uploadedBy !== actor.id) {
        throw apiError(403, 'FORBIDDEN', '다른 직원의 문서 연결 해제는 관리자만 할 수 있습니다.');
      }
      const transactionId = input.transactionId === undefined ? document.transactionId : input.transactionId;
      const partnerId = input.partnerId === undefined ? (transactionId !== document.transactionId ? null : document.partnerId) : input.partnerId;
      const links = await this.links(db, actor, partnerId, transactionId);
      await db.update(Document, id, { ...links, revision: document.revision + 1 });
    });
    return this.get(actor, id);
  }

  async correct(actor: Profile, id: number, input: CorrectDocumentDto) {
    requireChanges({ correctedText: input.correctedText, correctedJson: input.correctedJson });
    await this.database.transaction(async db => {
      const document = await this.find(db, actor, id, true);
      this.checkRevision(document, input.expectedRevision);
      if (processingEnabled() && document.currentJobVersion > 0 && !['READY', 'FAILED'].includes(document.status)) throw apiError(409, 'DOCUMENT_BUSY', '처리가 끝난 뒤 보정해주세요.');
      const beforeText = document.correctedText ?? document.ocrText;
      const beforeJson = document.correctedJson ?? document.extractedJson;
      const afterText  = input.correctedText ?? beforeText;
      const afterJson  = input.correctedJson ? {
        date: input.correctedJson.date ?? null, amount: input.correctedJson.amount ?? null,
        title: input.correctedJson.title ?? null, bizNumber: input.correctedJson.bizNumber ?? null,
      } : beforeJson;
      const revision = document.revision + 1;
      await db.insert(DocumentEdit, { organizationId: actor.organizationId, documentId: id, editorId: actor.id, revision, beforeText, afterText, beforeJson, afterJson });
      await db.update(Document, id, { correctedText: afterText, correctedJson: afterJson, revision });
    });
    return this.get(actor, id);
  }

  async history(actor: Profile, id: number, query: DocumentQueryDto) {
    return this.database.transaction(async db => {
      await this.find(db, actor, id);
      const [data, total] = await db.findAndCount(DocumentEdit, {
        where: { organizationId: actor.organizationId, documentId: id }, order: { revision: 'DESC' },
        skip: (query.page - 1) * query.limit, take: query.limit,
      });
      return { data, meta: { page: query.page, limit: query.limit, total } };
    });
  }

  async download(actor: Profile, id: number): Promise<StreamableFile> {
    const document = await this.query(this.database.manager, actor).addSelect('document.storageKey')
      .andWhere('document.id = :id', { id }).getOne();
    if (!document) throw apiError(404, 'DOCUMENT_NOT_FOUND', '문서를 찾을 수 없습니다.');
    return new StreamableFile(await this.storage.stream(document.storageKey), {
      type: document.contentType, length: Number(document.sizeBytes),
      disposition: `attachment; filename="document-${id}"; filename*=UTF-8''${encodeURIComponent(document.originalFilename)}`,
    });
  }
}
