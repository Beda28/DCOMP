import { randomUUID }    from 'node:crypto';
import { Catch, HttpException, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response  = host.switchToHttp().getResponse<Response>();
    const requestId = randomUUID();
    const status    = exception instanceof HttpException ? exception.getStatus() : 500;
    const body      = exception instanceof HttpException ? exception.getResponse() : null;
    const detail    = body   && typeof body   === 'object' && 'error' in body ? body.error : null;
    const error     = detail && typeof detail === 'object' ? detail : {
      code:    status === 404 ? 'NOT_FOUND' : status >= 500 ? 'INTERNAL_ERROR' : 'HTTP_ERROR',
      message: status === 404 ? '요청한 경로를 찾을 수 없습니다.' : '요청을 처리하지 못했습니다.',
      details: [],
    };

    if (status === 500) this.logger.error(`[${requestId}]`, exception instanceof Error ? exception.stack : exception);

    response.setHeader('X-Request-Id', requestId);
    response.setHeader('Cache-Control', 'no-store');
    response.status(status).json({ error, requestId });
  }
}
