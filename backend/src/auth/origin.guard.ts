import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { apiError }     from '../common/api-error.js';

@Injectable()
export class OriginGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const origin  = process.env.APP_ORIGIN ?? 'http://localhost';

    if (request.method === 'GET') return true;
    if (request.headers['x-requested-with'] !== 'XMLHttpRequest' || (request.headers.origin && request.headers.origin !== origin)) {
      throw apiError(403, 'FORBIDDEN', '허용되지 않은 요청입니다.');
    }
    return true;
  }
}
