import { Module }          from '@nestjs/common';
import { TypeOrmModule }   from '@nestjs/typeorm';
import { databaseOptions } from './database.config.js';

@Module({
  imports: [TypeOrmModule.forRoot({
    ...databaseOptions,
    autoLoadEntities: true,
  })],
})
export class DatabaseModule {}
