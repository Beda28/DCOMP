import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request }                                       from 'express';
import { AuthService }                                        from './auth.service.js';
import type { Profile }                                       from './user.entity.js';

export type AuthRequest = Request & { user: Profile };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    request.user  = await this.auth.authenticate(request.headers.authorization);
    return true;
  }
}
