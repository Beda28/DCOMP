import { duplicateError, requireChanges, searchPattern } from '../common/catalog.js';
import type { CreatePartnerDto, PartnerQueryDto, UpdatePartnerDto, PartnerRole } from './partner.dto.js';
import { Injectable }       from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository }       from 'typeorm';
import { apiError }         from '../common/api-error.js';
import { Partner }          from './partner.entity.js';

@Injectable()
export class PartnersService {
  constructor(@InjectRepository(Partner) private readonly partners: Repository<Partner>) {}

  private profile(partner: Partner) {
    const { isCustomer, isSupplier, ...data } = partner;
    const roles: PartnerRole[] = [];
    if (isCustomer) roles.push('CUSTOMER');
    if (isSupplier) roles.push('SUPPLIER');
    return { ...data, roles };
  }

  private fields(data: CreatePartnerDto | UpdatePartnerDto) {
    const { roles, ...fields } = data;
    return roles ? { ...fields, isCustomer: roles.includes('CUSTOMER'), isSupplier: roles.includes('SUPPLIER') } : fields;
  }

  async list(query: PartnerQueryDto) {
    const builder = this.partners.createQueryBuilder('partner');
    if (query.q) builder.andWhere("partner.name LIKE :q ESCAPE '='", { q: searchPattern(query.q) });
    if (query.status) builder.andWhere('partner.status = :status', { status: query.status });
    if (query.role) builder.andWhere(query.role === 'CUSTOMER' ? 'partner.is_customer = 1' : 'partner.is_supplier = 1');
    const [rows, total] = await builder.orderBy('partner.id', 'DESC').skip((query.page - 1) * query.limit).take(query.limit).getManyAndCount();
    return { data: rows.map(row => this.profile(row)), meta: { page: query.page, limit: query.limit, total } };
  }

  async get(id: number) {
    const partner = await this.partners.findOneBy({ id });
    if (!partner) throw apiError(404, 'PARTNER_NOT_FOUND', '거래처를 찾을 수 없습니다.');
    return { data: this.profile(partner) };
  }

  async create(data: CreatePartnerDto) {
    try {
      const partner = await this.partners.save(this.partners.create(this.fields(data)));
      return this.get(partner.id);
    }
    catch (error) { return duplicateError(error, 'DUPLICATE_BIZ_NUMBER', '이미 등록된 사업자등록번호입니다.'); }
  }

  async update(id: number, data: UpdatePartnerDto) {
    const fields = this.fields(data);
    requireChanges(fields);
    await this.get(id);
    try { await this.partners.update(id, fields); }
    catch (error) { return duplicateError(error, 'DUPLICATE_BIZ_NUMBER', '이미 등록된 사업자등록번호입니다.'); }
    return this.get(id);
  }

  async deactivate(id: number): Promise<void> {
    await this.get(id);
    await this.partners.update(id, { status: 'INACTIVE' });
  }
}
