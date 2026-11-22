import { Module }              from '@nestjs/common';
import { DatabaseModule }      from './database/database.module.js';
import { HealthModule }        from './health/health.module.js';
import { AuthModule }          from './auth/auth.module.js';
import { PartnersModule }      from './partners/partners.module.js';
import { ItemsModule }         from './items/items.module.js';
import { OrganizationsModule } from './organizations/organizations.module.js';
import { UsersModule }         from './users/users.module.js';
import { TransactionsModule }  from './transactions/transactions.module.js';

@Module({
  imports: [
    DatabaseModule, HealthModule, AuthModule, OrganizationsModule,
    UsersModule, PartnersModule, ItemsModule, TransactionsModule,
  ],
})
export class AppModule {}
