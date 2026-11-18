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

  async list(query: ListQueryDto) {
    const builder = this.items.createQueryBuilder('item');
    if (query.q) builder.andWhere("(item.name LIKE :q ESCAPE '=' OR item.sku LIKE :q ESCAPE '=')", { q: searchPattern(query.q) });
    if (query.status) builder.andWhere('item.status = :status', { status: query.status });
    const [data, total] = await builder.orderBy('item.id', 'DESC').skip((query.page - 1) * query.limit).take(query.limit).getManyAndCount();
    return { data, meta: { page: query.page, limit: query.limit, total } };
  }

  async get(id: number) {
    const item = await this.items.findOneBy({ id });
    if (!item) throw apiError(404, 'ITEM_NOT_FOUND', '품목을 찾을 수 없습니다.');
    return { data: item };
  }

  async create(data: CreateItemDto) {
    try {
      const item = await this.items.save(this.items.create(data));
      return this.get(item.id);
    }
    catch (error) { return duplicateError(error, 'DUPLICATE_SKU', '이미 등록된 SKU입니다.'); }
  }

  async update(id: number, data: UpdateItemDto) {
    requireChanges(data);
    await this.get(id);
    try { await this.items.update(id, data); }
    catch (error) { return duplicateError(error, 'DUPLICATE_SKU', '이미 등록된 SKU입니다.'); }
    return this.get(id);
  }

  async deactivate(id: number): Promise<void> {
    await this.get(id);
    await this.items.update(id, { status: 'INACTIVE' });
  }
}
