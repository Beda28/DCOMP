import { DataSource, IsNull, type EntityManager } from 'typeorm';
import { duplicateError, searchPattern } from '../common/catalog.js';
import type { CreateUserDto, ResetPasswordDto, UpdateUserDto, UserQueryDto } from './user.dto.js';
import { Injectable }         from '@nestjs/common';
import { User, type Profile } from '../auth/user.entity.js';
import { AuthSession }        from '../auth/auth-session.entity.js';
import { Organization }       from '../organizations/organization.entity.js';
import { apiError }           from '../common/api-error.js';
import { hash }               from '../auth/password.js';

@Injectable()
export class UsersService {
  constructor(private readonly database: DataSource) {}

  private profile(user: User) {
    return { id: user.id, username: user.username, role: user.role, status: user.status };
  }

  private async authorize(db: EntityManager, actor: Profile): Promise<void> {
    const organization = await db.findOne(Organization, {
      where: { id: actor.organizationId, status: 'ACTIVE' },
      lock:  { mode: 'pessimistic_write' },
    });
    const admin = await db.findOneBy(User, { id: actor.id, organizationId: actor.organizationId, role: 'ADMIN', status: 'ACTIVE' });
    if (!organization || !admin) throw apiError(403, 'FORBIDDEN', '직원 관리 권한이 없습니다.');
  }

  private async find(db: EntityManager, organizationId: number, id: number, lock = false): Promise<User> {
    const user = await db.findOne(User, {
      where: { id, organizationId },
      lock:  lock ? { mode: 'pessimistic_write' } : undefined,
    });
    if (!user) throw apiError(404, 'USER_NOT_FOUND', '직원을 찾을 수 없습니다.');
    return user;
  }

  async list(organizationId: number, query: UserQueryDto) {
    const builder = this.database.getRepository(User).createQueryBuilder('user').where('user.organization_id = :organizationId', { organizationId });

    if (query.q)      builder.andWhere("user.username LIKE :q ESCAPE '='", { q: searchPattern(query.q) });
    if (query.status) builder.andWhere('user.status = :status', { status: query.status });

    const [rows, total] = await builder.orderBy('user.id', 'DESC').skip((query.page - 1) * query.limit).take(query.limit).getManyAndCount();
    return { data: rows.map(user => this.profile(user)), meta: { page: query.page, limit: query.limit, total } };
  }

  async get(organizationId: number, id: number) {
    return { data: this.profile(await this.find(this.database.manager, organizationId, id)) };
  }

  async create(actor: Profile, data: CreateUserDto) {
    const passwordHash = await hash(data.password);

    try {
      return await this.database.transaction(async db => {
        await this.authorize(db, actor);

        const user = await db.save(User, db.create(User, { organizationId: actor.organizationId, username: data.username, passwordHash, role: 'STAFF' }));
        return { data: this.profile(user) };
      });
    }
    catch (error) { return duplicateError(error, 'USERNAME_TAKEN', '이 회사에서 이미 사용 중인 아이디입니다.'); }
  }

  async update(actor: Profile, id: number, data: UpdateUserDto) {
    return this.database.transaction(async db => {
      await this.authorize(db, actor);
      const user = await this.find(db, actor.organizationId, id, true);

      if (data.status === 'DISABLED') {
        if (user.id === actor.id) throw apiError(403, 'FORBIDDEN', '본인 계정은 비활성화할 수 없습니다.');
        if (user.role === 'ADMIN' && await db.countBy(User, { organizationId: actor.organizationId, role: 'ADMIN', status: 'ACTIVE' }) <= 1) {
          throw apiError(403, 'FORBIDDEN', '마지막 활성 관리자는 비활성화할 수 없습니다.');
        }
        await db.update(AuthSession, { userId: user.id, revokedAt: IsNull() }, { revokedAt: new Date() });
      }

      await db.update(User, { id, organizationId: actor.organizationId }, { status: data.status });
      return { data: this.profile({ ...user, status: data.status }) };
    });
  }

  async resetPassword(actor: Profile, id: number, data: ResetPasswordDto): Promise<void> {
    const passwordHash = await hash(data.newPassword);

    await this.database.transaction(async db => {
      await this.authorize(db, actor);
      const user = await this.find(db, actor.organizationId, id, true);

      await db.update(User, { id, organizationId: actor.organizationId }, { passwordHash });
      await db.update(AuthSession, { userId: user.id, revokedAt: IsNull() }, { revokedAt: new Date() });
    });
  }
}
