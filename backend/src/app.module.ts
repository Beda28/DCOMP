import { Module }         from '@nestjs/common';
import { DatabaseModule } from './database/database.module.js';
import { RedisModule }    from './redis/redis.module.js';
import { HealthModule }   from './health/health.module.js';
import { AuthModule }     from './auth/auth.module.js';

@Module({ imports: [DatabaseModule, RedisModule, HealthModule, AuthModule] })
export class AppModule {}
