import { Injectable, Logger, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, UnrecoverableError, type Job } from 'bullmq';
import { DataSource, In }       from 'typeorm';
import { Document, type DocumentFields } from './document.entity.js';
import { DocumentJob }         from './document-job.entity.js';
import { processingEnabled }   from '../common/processing.js';

type Work = { documentId: number; version: number };
type OcrResult = { text: string; fields: DocumentFields };

@Injectable()
export class DocumentWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DocumentWorker.name);
  private queue?: Queue<Work>;
  private worker?: Worker<Work>;
  private timer?: ReturnType<typeof setInterval>;
  private dispatching?: Promise<void>;
  private readonly failedWrites = new Set<Promise<void>>();

  constructor(private readonly database: DataSource) {}

  async onModuleInit(): Promise<void> {
    if (!processingEnabled() || process.env.DOCUMENT_WORKER_ENABLED === 'false') return;
    const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
    const connection = {
      host: url.hostname, port: Number(url.port || 6379), db: Number(url.pathname.slice(1) || 0),
      username: decodeURIComponent(url.username) || undefined, password: decodeURIComponent(url.password) || undefined,
      ...(url.protocol === 'rediss:' ? { tls: {} } : {}), maxRetriesPerRequest: null,
    };
    const prefix = process.env.DOCUMENT_QUEUE_PREFIX ?? 'bull';
    this.queue = new Queue<Work>('documents', { prefix, connection: { ...connection, maxRetriesPerRequest: 1, enableOfflineQueue: false } });
    this.worker = new Worker<Work>('documents', job => this.process(job), { prefix, connection, concurrency: 2 });
    this.queue.on('error', () => this.logger.error('문서 큐 연결 오류'));
    this.worker.on('error', () => this.logger.error('문서 작업자 연결 오류'));
    this.worker.on('failed', (job, error) => {
      if (job && (error instanceof UnrecoverableError || job.attemptsMade >= 3 || error.message.includes('stalled'))) {
        const write = this.fail(job.data, 'OCR_FAILED', '문서 처리가 중단되었습니다. 재처리해주세요.')
          .catch(() => this.logger.error('문서 실패 상태 기록 오류')).finally(() => this.failedWrites.delete(write));
        this.failedWrites.add(write);
      }
    });
    await this.queue.waitUntilReady();
    this.timer = setInterval(() => { void this.dispatch(); }, 2000);
    this.timer.unref();
    void this.dispatch();
  }

  dispatch(): Promise<void> {
    if (!this.queue) return Promise.resolve();
    if (!this.dispatching) {
      this.dispatching = this.reconcile().catch(() => this.logger.error('문서 큐 등록 실패: 다음 주기에 재시도합니다.'))
        .finally(() => { this.dispatching = undefined; });
    }
    return this.dispatching;
  }

  private async reconcile(): Promise<void> {
    const pending = await this.database.manager.find(DocumentJob, {
      where: { status: In(['PENDING_ENQUEUE', 'QUEUED', 'PROCESSING']) }, order: { updatedAt: 'ASC' }, take: 100,
    });
    for (const job of pending) {
      const work = { documentId: job.documentId, version: job.version };
      const existing = await this.queue!.getJob(job.bullmqJobId);
      if (existing) {
        const state = await existing.getState();
        if (state === 'failed' || state === 'completed') await this.fail(work, 'OCR_INTERRUPTED', '문서 처리가 중단되었습니다. 재처리해주세요.');
      }
      else {
        await this.queue!.add('ocr', work, {
          jobId: job.bullmqJobId, attempts: 3, backoff: { type: 'exponential', delay: 3000 },
          removeOnComplete: { age: 86400, count: 1000 }, removeOnFail: { age: 604800, count: 1000 },
        });
      }
      await this.database.transaction(async db => {
        const document = await db.findOne(Document, { where: { id: job.documentId }, lock: { mode: 'pessimistic_write' } });
        if (!document || document.currentJobVersion !== job.version) return;
        await db.update(DocumentJob, { id: job.id, status: 'PENDING_ENQUEUE' }, { status: 'QUEUED' });
        await db.update(Document, { id: document.id, status: 'UPLOADED' }, { status: 'QUEUED' });
      });
    }
  }

  async process(job: Pick<Job<Work>, 'data'>): Promise<void> {
    const { documentId, version } = job.data;
    const document = await this.database.transaction(async db => {
      const document = await db.createQueryBuilder(Document, 'document').addSelect('document.storageKey')
        .where('document.id = :id', { id: documentId }).setLock('pessimistic_write').getOne();
      if (!document || document.currentJobVersion !== version) return null;
      const record = await db.findOneBy(DocumentJob, { documentId, version });
      if (!record || ['COMPLETED', 'FAILED'].includes(record.status)) return null;
      await db.update(DocumentJob, record.id, { status: 'PROCESSING', attempts: record.attempts + 1, startedAt: new Date(), finishedAt: null });
      await db.update(Document, documentId, { status: 'PROCESSING' });
      return document;
    });
    if (!document) return;

    try {
      const response = await fetch(`${process.env.FASTAPI_URL ?? 'http://localhost:8000'}/internal/ocr`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(180000),
        body: JSON.stringify({ storageKey: document.storageKey, contentType: document.contentType, sha256: document.sha256 }),
      });
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) throw new UnrecoverableError('문서 형식이나 내용을 읽을 수 없습니다. 파일을 확인해주세요.');
        throw new Error('OCR 서비스에 연결할 수 없습니다.');
      }
      const result = await response.json() as OcrResult;
      if (typeof result.text !== 'string' || result.text.length > 100000 || !result.fields || typeof result.fields !== 'object') throw new Error('OCR 응답 오류');
      await this.database.transaction(async db => {
        const current = await db.findOne(Document, { where: { id: documentId }, lock: { mode: 'pessimistic_write' } });
        if (!current || current.currentJobVersion !== version) return;
        await db.update(Document, documentId, {
          ocrText: result.text, extractedJson: result.fields, status: 'READY', processedAt: new Date(), revision: current.revision + 1,
        });
        await db.update(DocumentJob, { documentId, version }, { status: 'COMPLETED', finishedAt: new Date(), errorCode: null, errorMessage: null });
      });
    }
    catch (error) {
      const record = await this.database.manager.findOneBy(DocumentJob, { documentId, version });
      if (error instanceof UnrecoverableError || (record?.attempts ?? 0) >= 3) {
        await this.fail(job.data, 'OCR_FAILED', error instanceof UnrecoverableError ? error.message : '문서 처리에 실패했습니다. 재처리해주세요.');
      }
      else {
        await this.database.transaction(async db => {
          const current = await db.findOne(Document, { where: { id: documentId }, lock: { mode: 'pessimistic_write' } });
          if (!current || current.currentJobVersion !== version) return;
          await db.update(Document, documentId, { status: 'QUEUED' });
          await db.update(DocumentJob, { documentId, version }, { status: 'QUEUED', errorCode: 'OCR_RETRY', errorMessage: '자동 재시도 대기 중입니다.' });
        });
      }
      throw error;
    }
  }

  private async fail(work: Work, errorCode: string, errorMessage: string): Promise<void> {
    await this.database.transaction(async db => {
      const document = await db.findOne(Document, { where: { id: work.documentId }, lock: { mode: 'pessimistic_write' } });
      if (!document || document.currentJobVersion !== work.version || ['READY', 'FAILED'].includes(document.status)) return;
      await db.update(Document, document.id, { status: 'FAILED', revision: document.revision + 1 });
      await db.update(DocumentJob, { documentId: document.id, version: work.version }, { status: 'FAILED', errorCode, errorMessage, finishedAt: new Date() });
    });
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.timer);
    await this.dispatching;
    await this.worker?.close();
    await Promise.all(this.failedWrites);
    await this.queue?.close();
    this.worker = undefined;
    this.queue = undefined;
  }
}
