import { Module }          from '@nestjs/common';
import { TypeOrmModule }   from '@nestjs/typeorm';
import { AuthModule }      from '../auth/auth.module.js';
import { Item }            from './item.entity.js';
import { ItemsController } from './items.controller.js';
import { ItemsService }    from './items.service.js';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([Item])],
  controllers: [ItemsController],
  providers: [ItemsService],
})
export class ItemsModule {}
