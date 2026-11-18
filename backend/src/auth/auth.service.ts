import { HttpException, Injectable } from '@nestjs/common';
import { JwtService }         from '@nestjs/jwt';
import { InjectRepository }   from '@nestjs/typeorm';
import { randomUUID }         from 'node:crypto';
import { Repository }         from 'typeorm';
import { RedisService }       from '../redis/redis.service.js';
import { apiError }           from '../common/api-error.js';
import { SessionService }     from './session.service.js';
import { User, type Profile } from './user.entity.js';
import { verify }             from './password.js';
import type { LoginDto }      from './auth.dto.js';
import { Organization }       from '../organizations/organization.entity.js';

type AccessClaims = { sub: string; sid: string; jti: string; type: string; exp: number };

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Organization) private readonly organizations: Repository<Organization>,
    private readonly jwt:      JwtService,
    private readonly sessions: SessionService,
    private readonly redis:    RedisService,
  ) {}

  private async store<T>(action: () => Promise<T>): Promise<T> {
    try { return await action(); }
    catch (error) {
      if (error instanceof HttpException) throw error;
      throw apiError(503, 'AUTH_STORE_UNAVAILABLE', '인증 저장소에 연결할 수 없습니다.');
    }
  }

  private async issue(user: User, familyId: string) {
    const accessToken = await this.jwt.signAsync({ sub: String(user.id), sid: familyId, jti: randomUUID(), type: 'access' });
    return { accessToken, expiresIn: 900 };
  }

  async login(data: LoginDto) {
    const organization = await this.store(() => this.organizations.findOneBy({ code: data.companyCode }));
    const user = organization ? await this.store(() => this.users.findOne({
      where: { organizationId: organization.id, username: data.username },
      select: { id: true, organizationId: true, username: true, role: true, status: true, passwordHash: true },
    })) : null;
    const valid = await verify(data.password, user?.passwordHash);
    if (!user || !valid || user.status !== 'ACTIVE' || organization?.status !== 'ACTIVE') {
      throw apiError(401, 'INVALID_CREDENTIALS', '회사 코드, 아이디 또는 비밀번호를 확인해주세요.');
    }

    return this.store(async () => {
      const session = await this.sessions.create(user.id, user.passwordHash);
      const profile = { id: session.user.id, organizationId: session.user.organizationId, username: session.user.username, role: session.user.role };
      return { data: { ...await this.issue(session.user, session.familyId), user: profile }, refreshToken: session.token };
    });
  }

  async refresh(token?: unknown) {
    return this.store(async () => {
      const session = await this.sessions.rotate(token);
      return { data: await this.issue(session.user, session.familyId), refreshToken: session.token };
    });
  }

  private async claims(authorization?: string): Promise<AccessClaims> {
    const token = authorization?.match(/^Bearer (\S+)$/i)?.[1];
    if (!token) throw apiError(401, 'UNAUTHORIZED', '로그인이 필요합니다.');

    try {
      const data = await this.jwt.verifyAsync<AccessClaims>(token);
      if (data.type !== 'access' || typeof data.sub !== 'string' || !/^[1-9]\d*$/.test(data.sub) ||
          !Number.isSafeInteger(Number(data.sub)) || typeof data.sid !== 'string' || typeof data.jti !== 'string' ||
          !/^[a-f\d-]{36}$/.test(data.sid) || !/^[a-f\d-]{36}$/.test(data.jti) || !Number.isInteger(data.exp)) throw new Error();
      return data;
    }
    catch { throw apiError(401, 'UNAUTHORIZED', '다시 로그인해주세요.'); }
  }

  async authenticate(authorization?: string): Promise<Profile> {
    const data = await this.claims(authorization);
    return this.store(async () => {
      if (await this.redis.accessDenied(data.jti)) throw apiError(401, 'UNAUTHORIZED', '종료된 세션입니다.');

      const user         = await this.users.findOneBy({ id: Number(data.sub) });
      const active       = await this.sessions.active(Number(data.sub), data.sid);
      const organization = user ? await this.organizations.findOneBy({ id: user.organizationId, status: 'ACTIVE' }) : null;
      if (!user || user.status !== 'ACTIVE' || !active || !organization) throw apiError(401, 'UNAUTHORIZED', '다시 로그인해주세요.');
      return { id: user.id, organizationId: user.organizationId, username: user.username, role: user.role, status: user.status };
    });
  }

  async logout(token?: unknown, authorization?: string): Promise<void> {
    let claims: AccessClaims | undefined;
    if (authorization) {
      try { claims = await this.claims(authorization); }
      catch { /* 만료된 Access가 있어도 Refresh 세션은 폐기한다. */ }
    }

    await this.store(async () => {
      if (claims) await this.redis.denyAccess(claims.jti, claims.exp);
      else await this.redis.ping();
      await this.sessions.revoke(token);
    });
  }
}
