import { Injectable }                   from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DataSource, IsNull, MoreThan } from 'typeorm';
import type { EntityManager }           from 'typeorm';
import { AuthSession }                  from './auth-session.entity.js';
import { User }                         from './user.entity.js';
import { apiError }                     from '../common/api-error.js';

export const refreshLifetime = 7 * 24 * 60 * 60;

@Injectable()
export class SessionService {
  constructor(private readonly database: DataSource) {}

  private digest(token?: unknown): string | null {
    if (typeof token !== 'string' || !/^[a-f\d]{64}$/.test(token)) return null;
    return createHash('sha256').update(token).digest('hex');
  }

  private async issue(db: EntityManager, userId: number, familyId: string) {
    const token     = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + refreshLifetime * 1000);
    await db.insert(AuthSession, { userId, familyId, refreshTokenHash: this.digest(token)!, expiresAt });
    return { token, familyId };
  }

  async create(userId: number) {
    return this.database.transaction(async db => {
      const user = await db.findOne(User, { where: { id: userId }, lock: { mode: 'pessimistic_write' } });
      if (!user || user.status !== 'ACTIVE') throw apiError(423, 'ACCOUNT_DISABLED', '비활성화된 계정입니다.');
      return { ...await this.issue(db, user.id, randomUUID()), user };
    });
  }

  async rotate(token?: unknown) {
    const digest = this.digest(token);
    if (!digest) throw apiError(401, 'REFRESH_EXPIRED', '다시 로그인해주세요.');

    const result = await this.database.transaction(async db => {
      const known = await db.findOneBy(AuthSession, { refreshTokenHash: digest });
      if (!known) return { error: 'REFRESH_EXPIRED' } as const;

      // 사용자 행을 먼저 잠가 같은 세션의 갱신과 폐기를 순서대로 처리한다.
      const user = await db.findOne(User, { where: { id: known.userId }, lock: { mode: 'pessimistic_write' } });
      const row  = await db.findOneOrFail(AuthSession, { where: { id: known.id }, lock: { mode: 'pessimistic_write' } });
      if (row.revokedAt || !user || user.status !== 'ACTIVE') {
        await db.update(AuthSession, { familyId: row.familyId, revokedAt: IsNull() }, { revokedAt: new Date() });
        return { error: 'SESSION_REVOKED' } as const;
      }
      if (row.expiresAt.getTime() <= Date.now()) return { error: 'REFRESH_EXPIRED' } as const;

      await db.update(AuthSession, row.id, { revokedAt: new Date() });
      return { ...await this.issue(db, row.userId, row.familyId), user };
    });

    // 재사용으로 폐기한 기록은 트랜잭션 커밋 후 오류를 반환해야 남는다.
    if ('error' in result) throw apiError(401, result.error!, '다시 로그인해주세요.');
    return result;
  }

  async revoke(token?: unknown): Promise<void> {
    const digest = this.digest(token);
    if (!digest) throw apiError(401, 'SESSION_REVOKED', '이미 종료된 세션입니다.');

    const active = await this.database.transaction(async db => {
      const known = await db.findOneBy(AuthSession, { refreshTokenHash: digest });
      if (!known) return false;

      await db.findOne(User, { where: { id: known.userId }, lock: { mode: 'pessimistic_write' } });
      const row = await db.findOneOrFail(AuthSession, { where: { id: known.id }, lock: { mode: 'pessimistic_write' } });
      await db.update(AuthSession, { familyId: row.familyId, revokedAt: IsNull() }, { revokedAt: new Date() });
      return !row.revokedAt && row.expiresAt.getTime() > Date.now();
    });

    if (!active) throw apiError(401, 'SESSION_REVOKED', '이미 종료된 세션입니다.');
  }

  async active(userId: number, familyId: string): Promise<boolean> {
    return this.database.getRepository(AuthSession).existsBy({
      userId, familyId, revokedAt: IsNull(), expiresAt: MoreThan(new Date()),
    });
  }
}
