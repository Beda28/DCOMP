import type { Profile }     from '../auth/user.entity.js';
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
    const roles: PartnerRole[]                = [];

    if (isCustomer) roles.push('CUSTOMER');
    if (isSupplier) roles.push('SUPPLIER');
    return { ...data, roles };
  }

  private fields(data: CreatePartnerDto | UpdatePartnerDto) {
    const { roles, ...fields } = data;
    return roles ? { ...fields, isCustomer: roles.includes('CUSTOMER'), isSupplier: roles.includes('SUPPLIER') } : fields;
  }

  async list(organizationId: number, query: PartnerQueryDto) {
    const builder = this.partners.createQueryBuilder('partner').where('partner.organization_id = :organizationId', { organizationId });

    if (query.q)      builder.andWhere("partner.name LIKE :q ESCAPE '='", { q: searchPattern(query.q) });
    if (query.status) builder.andWhere('partner.status = :status', { status: query.status });
    if (query.role)   builder.andWhere(query.role === 'CUSTOMER' ? 'partner.is_customer = 1' : 'partner.is_supplier = 1');

    const [rows, total] = await builder.orderBy('partner.id', 'DESC').skip((query.page - 1) * query.limit).take(query.limit).getManyAndCount();
    return { data: rows.map(row => this.profile(row)), meta: { page: query.page, limit: query.limit, total } };
  }

  async get(organizationId: number, id: number) {
    const partner = await this.partners.findOneBy({ id, organizationId });
    if (!partner) throw apiError(404, 'PARTNER_NOT_FOUND', '거래처를 찾을 수 없습니다.');
    return { data: this.profile(partner) };
  }

  async create(organizationId: number, data: CreatePartnerDto) {
    try {
      const partner = await this.partners.save(this.partners.create({ ...this.fields(data), organizationId }));
      return this.get(organizationId, partner.id);
    }
    catch (error) { return duplicateError(error, 'DUPLICATE_BIZ_NUMBER', '이미 등록된 사업자등록번호입니다.'); }
  }

  async update(actor: Profile, id: number, data: UpdatePartnerDto) {
    const fields = this.fields(data);
    requireChanges(fields);
    await this.get(actor.organizationId, id);

    try { await this.partners.update({ id, organizationId: actor.organizationId }, fields); }
    catch (error) { return duplicateError(error, 'DUPLICATE_BIZ_NUMBER', '이미 등록된 사업자등록번호입니다.'); }

    return this.get(actor.organizationId, id);
  }

  async deactivate(actor: Profile, id: number): Promise<void> {
    await this.get(actor.organizationId, id);
    if (actor.role !== 'ADMIN') throw apiError(403, 'FORBIDDEN', '접근 권한이 없습니다.');

    await this.partners.update({ id, organizationId: actor.organizationId }, { status: 'INACTIVE' });
  }
}
