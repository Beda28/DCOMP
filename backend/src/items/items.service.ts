import type { Profile }      from '../auth/user.entity.js';
import { duplicateError, requireChanges, searchPattern } from '../common/catalog.js';
import type { CreateItemDto, UpdateItemDto } from './item.dto.js';
import { Injectable }        from '@nestjs/common';
import { InjectRepository }  from '@nestjs/typeorm';
import { Repository }        from 'typeorm';
import { apiError }          from '../common/api-error.js';
import type { ListQueryDto } from '../common/catalog.dto.js';
import { Item }              from './item.entity.js';

@Injectable()
export class ItemsService {
  constructor(@InjectRepository(Item) private readonly items: Repository<Item>) {}

  async list(organizationId: number, query: ListQueryDto) {
    const builder = this.items.createQueryBuilder('item').where('item.organization_id = :organizationId', { organizationId });

    if (query.q)      builder.andWhere("(item.name LIKE :q ESCAPE '=' OR item.sku LIKE :q ESCAPE '=')", { q: searchPattern(query.q) });
    if (query.status) builder.andWhere('item.status = :status', { status: query.status });

    const [data, total] = await builder.orderBy('item.id', 'DESC').skip((query.page - 1) * query.limit).take(query.limit).getManyAndCount();
    return { data, meta: { page: query.page, limit: query.limit, total } };
  }

  async get(organizationId: number, id: number) {
    const item = await this.items.findOneBy({ id, organizationId });
    if (!item)   throw apiError(404, 'ITEM_NOT_FOUND', '품목을 찾을 수 없습니다.');
    return { data: item };
  }

  async create(organizationId: number, data: CreateItemDto) {
    try {
      const item = await this.items.save(this.items.create({ ...data, organizationId }));
      return this.get(organizationId, item.id);
    }
    catch (error) { return duplicateError(error, 'DUPLICATE_SKU', '이미 등록된 SKU입니다.'); }
  }

  async update(actor: Profile, id: number, data: UpdateItemDto) {
    requireChanges(data);
    await this.get(actor.organizationId, id);

    if (actor.role !== 'ADMIN') throw apiError(403, 'FORBIDDEN', '접근 권한이 없습니다.');

    try { await this.items.update({ id, organizationId: actor.organizationId }, data); }
    catch (error) { return duplicateError(error, 'DUPLICATE_SKU', '이미 등록된 SKU입니다.'); }

    return this.get(actor.organizationId, id);
  }

  async deactivate(actor: Profile, id: number): Promise<void> {
    await this.get(actor.organizationId, id);
    if (actor.role !== 'ADMIN') throw apiError(403, 'FORBIDDEN', '접근 권한이 없습니다.');

    await this.items.update({ id, organizationId: actor.organizationId }, { status: 'INACTIVE' });
  }
}
