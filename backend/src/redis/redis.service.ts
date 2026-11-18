import { Injectable, Logger }                         from '@nestjs/common';
import type { OnModuleInit, OnApplicationShutdown }    from '@nestjs/common';
import { createClient }                               from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RedisService.name);
  private readonly client = createClient({
    url:                 process.env.REDIS_URL ?? 'redis://localhost:6379',
    socket:              { connectTimeout: 3000 },
    disableOfflineQueue: true,
  });

  async onModuleInit(): Promise<void> {
    this.client.on('error', () => this.logger.error('Redis 연결 오류'));
    await this.client.connect();
  }

  async ping(): Promise<void> {
    const result = await this.client.withAbortSignal(AbortSignal.timeout(3000)).ping();
    if (result !== 'PONG') throw new Error('Redis 응답 오류');
  }

  async accessDenied(jti: string): Promise<boolean> {
    const value = await this.client.withAbortSignal(AbortSignal.timeout(3000)).get(`auth:denied:${jti}`);
    return value !== null;
  }

  async denyAccess(jti: string, expiresAt: number): Promise<void> {
    if (expiresAt <= Math.floor(Date.now() / 1000)) return;
    await this.client.withAbortSignal(AbortSignal.timeout(3000)).set(`auth:denied:${jti}`, '1', { EXAT: expiresAt });
  }

  onApplicationShutdown(): void {
    if (this.client.isOpen) this.client.destroy();
  }
}
