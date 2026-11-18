import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DataSource }   from 'typeorm';
import { RedisService } from '../redis/redis.service.js';

type Status = 'ok' | 'error';

@Injectable()
export class HealthService {
  constructor(
    private readonly database: DataSource,
    private readonly redis:    RedisService,
  ) {}

  async check() {
    const [mysql, redis, fastapi] = await Promise.all([
      this.probe(() => this.database.query('SELECT 1')),
      this.probe(() => this.redis.ping()),
      this.probe(() => this.processing()),
    ]);
    const services = { mysql, redis, fastapi };

    if (Object.values(services).some(status => status !== 'ok')) {
      throw new ServiceUnavailableException({ error: {
        code:    'SERVICE_UNAVAILABLE',
        message: '일부 서비스에 연결할 수 없습니다.',
        details: Object.entries(services).map(([service, status]) => ({ service, status })),
      } });
    }

    return { data: { status: 'ok', services } };
  }

  private async processing(): Promise<void> {
    const url = process.env.FASTAPI_URL ?? 'http://localhost:8000';
    const res = await fetch(`${url}/internal/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error('FastAPI 연결 오류');

    const body = await res.json() as { status?: string };
    if (body.status !== 'ok') throw new Error('FastAPI 응답 오류');
  }

  private async probe(check: () => Promise<unknown>): Promise<Status> {
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      await Promise.race([
        check(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('연결 시간 초과')), 3000);
        }),
      ]);
      return 'ok';
    }
    catch   { return 'error'; }
    finally { clearTimeout(timer); }
  }
}
