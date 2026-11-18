import { Module }         from '@nestjs/common';
import { DatabaseModule } from './database/database.module.js';
import { RedisModule }    from './redis/redis.module.js';
import { HealthModule }   from './health/health.module.js';
import { AuthModule }     from './auth/auth.module.js';
import { PartnersModule } from './partners/partners.module.js';
import { ItemsModule }    from './items/items.module.js';

@Module({ imports: [DatabaseModule, RedisModule, HealthModule, AuthModule, PartnersModule, ItemsModule] })
export class AppModule {}
