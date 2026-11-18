import { Injectable }   from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { randomInt }    from 'node:crypto';
import { User }         from '../auth/user.entity.js';
import { hash }         from '../auth/password.js';
import { apiError }     from '../common/api-error.js';
import { Organization } from './organization.entity.js';
import type { RegisterOrganizationDto } from './organization.dto.js';

@Injectable()
export class OrganizationsService {
  constructor(private readonly database: DataSource) {}

  async register(data: RegisterOrganizationDto) {
    const passwordHash = await hash(data.password);

    for (let attempt = 0; attempt < 10; attempt++) {
      const code = randomInt(1000000).toString().padStart(6, '0');
      try {
        return await this.database.transaction(async db => {
          const organization = await db.save(Organization, db.create(Organization, { code, name: data.companyName }));
          const admin        = await db.save(User, db.create(User, { organizationId: organization.id, username: data.username, passwordHash, role: 'ADMIN' }));
          return {
            data: {
              organization: { id: organization.id, name: organization.name, code: organization.code },
              admin: { id: admin.id, username: admin.username, role: admin.role },
            },
          };
        });
      }
      catch (error) {
        if (error instanceof QueryFailedError && error.driverError.code === 'ER_DUP_ENTRY' && String(error.driverError.message).includes('uq_organizations_code')) continue;
        throw apiError(503, 'STORE_UNAVAILABLE', '회사 등록을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.');
      }
    }
    throw apiError(409, 'CODE_COLLISION_RETRY_EXHAUSTED', '회사 코드 발급에 실패했습니다. 다시 시도해주세요.');
  }

  async get(id: number) {
    const organization = await this.database.getRepository(Organization).findOneBy({ id, status: 'ACTIVE' });
    if (!organization) throw apiError(401, 'UNAUTHORIZED', '다시 로그인해주세요.');
    return { data: organization };
  }
}
