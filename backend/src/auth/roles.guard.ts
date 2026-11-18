import { Injectable, SetMetadata, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector }        from '@nestjs/core';
import { apiError }         from '../common/api-error.js';
import type { AuthRequest } from './auth.guard.js';
import type { User }        from './user.entity.js';

export const Roles = (...roles: User['role'][]) => SetMetadata('roles', roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<User['role'][]>('roles', [context.getHandler(), context.getClass()]);
    const user  = context.switchToHttp().getRequest<AuthRequest>().user;
    if (roles && (!user || !roles.includes(user.role))) throw apiError(403, 'FORBIDDEN', '접근 권한이 없습니다.');
    return true;
  }
}
