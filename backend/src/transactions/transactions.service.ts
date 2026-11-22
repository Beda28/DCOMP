import type { AssignTransactionDto, CreateTransactionDto, TransactionLineDto, TransactionQueryDto, UpdateTransactionDto } from './transaction.dto.js';
import { requireChanges, searchPattern } from '../common/catalog.js';
import { DataSource, QueryFailedError, type EntityManager } from 'typeorm';
import { Transaction, type TransactionType } from './transaction.entity.js';
import { Injectable }         from '@nestjs/common';
import { randomBytes }        from 'node:crypto';
import { User, type Profile } from '../auth/user.entity.js';
import { apiError }           from '../common/api-error.js';
import { Item }               from '../items/item.entity.js';
import { Partner }            from '../partners/partner.entity.js';
import { TransactionLine }    from './transaction-line.entity.js';
import { TransactionRead }    from './transaction-read.entity.js';
import { Document }           from '../documents/document.entity.js';
import { lineAmount, money, scaled } from './amount.js';

@Injectable()
export class TransactionsService {
  constructor(private readonly database: DataSource) {}

  private profile(transaction: Transaction) {
    const { partner, creator, assignee, read, ...data } = transaction;
    return { ...data, partnerName: partner.name, creatorName: creator.username, assigneeName: assignee.username, isUnread: !read };
  }

  private async find(db: EntityManager, actor: Profile, id: number, lock = false) {
    const transaction = await db.findOne(Transaction, {
      where: { id, organizationId: actor.organizationId, ...(actor.role === 'ADMIN' ? {} : { assigneeId: actor.id }) },
      lock:  lock ? { mode: 'pessimistic_write' } : undefined,
    });
    if (!transaction) throw apiError(404, 'TRANSACTION_NOT_FOUND', '거래를 찾을 수 없습니다.');
    return transaction;
  }

  private query(db: EntityManager, actor: Profile) {
    const builder = db.createQueryBuilder(Transaction, 'transaction')
      .leftJoin('transaction.partner', 'partner').addSelect(['partner.id', 'partner.name'])
      .leftJoin('transaction.creator', 'creator').addSelect(['creator.id', 'creator.username'])
      .leftJoin('transaction.assignee', 'assignee').addSelect(['assignee.id', 'assignee.username'])
      .leftJoinAndMapOne('transaction.read', TransactionRead, 'read',
        'read.organization_id = transaction.organization_id AND read.transaction_id = transaction.id AND read.user_id = :userId', { userId: actor.id })
      .where('transaction.organization_id = :organizationId', { organizationId: actor.organizationId });
    if (actor.role !== 'ADMIN') builder.andWhere('transaction.assignee_id = :userId', { userId: actor.id });
    return builder;
  }

  private async detail(db: EntityManager, actor: Profile, id: number) {
    const transaction = await this.query(db, actor).andWhere('transaction.id = :id', { id }).getOne();
    if (!transaction) throw apiError(404, 'TRANSACTION_NOT_FOUND', '거래를 찾을 수 없습니다.');

    const lines = await db.find(TransactionLine, { where: { transactionId: id, organizationId: actor.organizationId }, order: { position: 'ASC' } });
    return { data: { ...this.profile(transaction), lines } };
  }

  private number(): string { return randomBytes(8).toString('hex'); }

  private async partner(db: EntityManager, organizationId: number, id: number, type: TransactionType): Promise<void> {
    const partner = await db.findOne(Partner, { where: { id, organizationId }, lock: { mode: 'pessimistic_read' } });
    if (!partner) throw apiError(404, 'PARTNER_NOT_FOUND', '거래처를 찾을 수 없습니다.');
    if (partner.status !== 'ACTIVE') throw apiError(422, 'PARTNER_INACTIVE', '비활성 거래처는 거래에 사용할 수 없습니다.');
    if (type === 'PURCHASE' ? !partner.isSupplier : !partner.isCustomer) {
      throw apiError(422, 'PARTNER_ROLE_MISMATCH', '매입은 공급사, 매출은 고객사를 선택해주세요.');
    }
  }

  private async lines(db: EntityManager, organizationId: number, input: TransactionLineDto[], previous: TransactionLine[] = []) {
    const ids = input.map(line => line.itemId).sort((a, b) => a - b);
    const items = await db.createQueryBuilder(Item, 'item')
      .where('item.organization_id = :organizationId', { organizationId })
      .andWhere('item.id IN (:...ids)', { ids }).orderBy('item.id', 'ASC').setLock('pessimistic_read').getMany();
    if (items.length !== ids.length) throw apiError(404, 'ITEM_NOT_FOUND', '품목을 찾을 수 없습니다.');
    if (items.some(item => item.status !== 'ACTIVE')) throw apiError(422, 'ITEM_INACTIVE', '비활성 품목은 거래에 사용할 수 없습니다.');

    const catalog   = new Map(items.map(item => [item.id, item]));
    const snapshots = new Map(previous.map(line => [line.itemId, line]));
    const lines = input.map((line, index) => {
      const item     = catalog.get(line.itemId)!;
      const snapshot = snapshots.get(line.itemId);
      return {
        ...line, organizationId, position: index + 1,
        lineAmount: lineAmount(line.quantity, line.unitPrice),
        itemSkuSnapshot:  snapshot?.itemSkuSnapshot ?? item.sku,
        itemNameSnapshot: snapshot?.itemNameSnapshot ?? item.name,
      };
    });
    const totalAmount = money(lines.reduce((total, line) => total + scaled(line.lineAmount, 2), 0n));
    return { lines, totalAmount };
  }

  async list(actor: Profile, query: TransactionQueryDto) {
    if (query.from && query.to && query.from > query.to) throw apiError(400, 'VALIDATION_ERROR', '조회 시작일과 종료일을 확인해주세요.');

    const builder = this.query(this.database.manager, actor);

    if (query.q) builder.andWhere("(transaction.number LIKE :q ESCAPE '=' OR transaction.memo LIKE :q ESCAPE '=' OR partner.name LIKE :q ESCAPE '=')", { q: searchPattern(query.q) });
    if (query.assigneeId) builder.andWhere('transaction.assignee_id = :assigneeId', { assigneeId: query.assigneeId });
    if (query.type)      builder.andWhere('transaction.type = :type', { type: query.type });
    if (query.status)    builder.andWhere('transaction.status = :status', { status: query.status });
    if (query.partnerId) builder.andWhere('transaction.partner_id = :partnerId', { partnerId: query.partnerId });
    if (query.from)      builder.andWhere('transaction.occurred_at >= :from', { from: query.from });
    if (query.to)        builder.andWhere('transaction.occurred_at <= :to', { to: query.to });

    const [rows, total] = await builder.orderBy('transaction.occurred_at', 'DESC').addOrderBy('transaction.id', 'DESC')
      .skip((query.page - 1) * query.limit).take(query.limit).getManyAndCount();
    return { data: rows.map(row => this.profile(row)), meta: { page: query.page, limit: query.limit, total } };
  }

  async get(actor: Profile, id: number) {
    return this.database.transaction(db => this.detail(db, actor, id));
  }

  async create(actor: Profile, data: CreateTransactionDto) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.database.transaction(async db => {
          await this.partner(db, actor.organizationId, data.partnerId, data.type);
          const prepared = await this.lines(db, actor.organizationId, data.lines);

          const transaction = await db.save(Transaction, db.create(Transaction, {
            organizationId: actor.organizationId, createdBy: actor.id, assigneeId: actor.id,
            number: this.number(), type: data.type, partnerId: data.partnerId,
            occurredAt: data.occurredAt, memo: data.memo ?? null, totalAmount: prepared.totalAmount,
          }));
          await db.insert(TransactionLine, prepared.lines.map(line => ({ ...line, transactionId: transaction.id })));
          await db.insert(TransactionRead, { organizationId: actor.organizationId, transactionId: transaction.id, userId: actor.id });
          return this.detail(db, actor, transaction.id);
        });
      }
      catch (error) {
        if (!(error instanceof QueryFailedError) || error.driverError.code !== 'ER_DUP_ENTRY'
          || !String(error.driverError.sqlMessage).includes('uq_transactions_number')) throw error;
      }
    }
    throw apiError(503, 'TRANSACTION_NUMBER_UNAVAILABLE', '거래번호를 발급하지 못했습니다. 다시 시도해주세요.');
  }

  async assign(actor: Profile, id: number, data: AssignTransactionDto) {
    return this.database.transaction(async db => {
      const transaction = await this.find(db, actor, id, true);
      if (actor.role !== 'ADMIN') throw apiError(403, 'FORBIDDEN', '담당자는 관리자만 변경할 수 있습니다.');
      if (transaction.revision !== data.expectedRevision) throw apiError(409, 'REVISION_CONFLICT', '다른 사용자가 수정한 거래입니다. 새로 불러온 뒤 다시 수정해주세요.');

      const assignee = await db.findOne(User, {
        where: { id: data.assigneeId, organizationId: actor.organizationId }, lock: { mode: 'pessimistic_read' },
      });
      if (!assignee) throw apiError(404, 'USER_NOT_FOUND', '직원을 찾을 수 없습니다.');
      if (assignee.status !== 'ACTIVE') throw apiError(422, 'USER_INACTIVE', '활성 직원만 담당자로 지정할 수 있습니다.');

      if (transaction.assigneeId !== assignee.id) {
        await db.update(Transaction, { id, organizationId: actor.organizationId }, { assigneeId: assignee.id, revision: transaction.revision + 1 });
      }
      return this.detail(db, actor, id);
    });
  }

  async markRead(actor: Profile, id: number): Promise<void> {
    await this.database.transaction(async db => {
      await this.find(db, actor, id, true);
      await db.createQueryBuilder().insert().into(TransactionRead)
        .values({ organizationId: actor.organizationId, transactionId: id, userId: actor.id }).orIgnore().execute();
    });
  }

  async update(actor: Profile, id: number, data: UpdateTransactionDto) {
    const { expectedRevision, lines, ...fields } = data;
    requireChanges({ ...fields, lines });

    return this.database.transaction(async db => {
      const transaction = await this.find(db, actor, id, true);
      if (transaction.status !== 'DRAFT') throw apiError(409, 'INVALID_TRANSACTION_STATE', '초안 상태의 거래만 수정할 수 있습니다.');
      if (transaction.revision !== expectedRevision) throw apiError(409, 'REVISION_CONFLICT', '다른 사용자가 수정한 거래입니다. 새로 불러온 뒤 다시 수정해주세요.');

      const previous = await db.find(TransactionLine, { where: { transactionId: id, organizationId: actor.organizationId }, order: { position: 'ASC' } });
      await this.partner(db, actor.organizationId, fields.partnerId ?? transaction.partnerId, fields.type ?? transaction.type);
      const prepared = await this.lines(db, actor.organizationId, lines ?? previous, previous);

      if (lines) {
        await db.delete(TransactionLine, { transactionId: id, organizationId: actor.organizationId });
        await db.insert(TransactionLine, prepared.lines.map(line => ({ ...line, transactionId: id })));
      }
      await db.update(Transaction, { id, organizationId: actor.organizationId }, {
        ...fields, totalAmount: prepared.totalAmount, revision: transaction.revision + 1,
      });
      if (fields.partnerId && fields.partnerId !== transaction.partnerId) {
        await db.createQueryBuilder().update(Document)
          .set({ partnerId: fields.partnerId, revision: () => 'revision + 1' })
          .where('organization_id = :organizationId AND transaction_id = :id', { organizationId: actor.organizationId, id }).execute();
      }
      return this.detail(db, actor, id);
    });
  }

  async confirm(actor: Profile, id: number, revision: number) {
    return this.database.transaction(async db => {
      const transaction = await this.find(db, actor, id, true);
      if (transaction.status !== 'DRAFT') throw apiError(409, 'INVALID_TRANSACTION_STATE', '초안 상태의 거래만 확정할 수 있습니다.');
      if (transaction.revision !== revision) throw apiError(409, 'REVISION_CONFLICT', '다른 사용자가 수정한 거래입니다. 새로 불러온 뒤 다시 확정해주세요.');

      await this.partner(db, actor.organizationId, transaction.partnerId, transaction.type);
      const lines = await db.find(TransactionLine, { where: { transactionId: id, organizationId: actor.organizationId }, order: { position: 'ASC' } });
      if (!lines.length) throw apiError(409, 'INVALID_TRANSACTION_STATE', '거래 품목을 입력한 뒤 확정해주세요.');
      const prepared = await this.lines(db, actor.organizationId, lines, lines);

      await db.update(Transaction, { id, organizationId: actor.organizationId, status: 'DRAFT' }, {
        status: 'CONFIRMED', confirmedAt: new Date(), totalAmount: prepared.totalAmount, revision: transaction.revision + 1,
      });
      return this.detail(db, actor, id);
    });
  }

  async cancel(actor: Profile, id: number, revision: number) {
    return this.database.transaction(async db => {
      const transaction = await this.find(db, actor, id, true);
      if (actor.role !== 'ADMIN') throw apiError(403, 'FORBIDDEN', '거래 취소는 관리자만 할 수 있습니다.');
      if (transaction.status === 'CANCELED') throw apiError(409, 'INVALID_TRANSACTION_STATE', '이미 취소된 거래입니다.');
      if (transaction.revision !== revision) throw apiError(409, 'REVISION_CONFLICT', '다른 사용자가 수정한 거래입니다. 새로 불러온 뒤 다시 취소해주세요.');

      await db.update(Transaction, { id, organizationId: actor.organizationId, status: transaction.status }, {
        status: 'CANCELED', canceledAt: new Date(), revision: transaction.revision + 1,
      });
      return this.detail(db, actor, id);
    });
  }
}
