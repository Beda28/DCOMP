import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ListQueryDto, RecordIdDto }    from '../common/catalog.dto.js';
import { CreateItemDto, UpdateItemDto } from './item.dto.js';
import { AuthGuard }                    from '../auth/auth.guard.js';
import { OriginGuard }                  from '../auth/origin.guard.js';
import { Roles, RolesGuard }            from '../auth/roles.guard.js';
import { ItemsService }                 from './items.service.js';

@Controller('items')
@UseGuards(AuthGuard, OriginGuard, RolesGuard)
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Get()
  list(@Query() query: ListQueryDto) { return this.items.list(query); }

  @Post()
  @Roles('ADMIN')
  create(@Body() body: CreateItemDto) { return this.items.create(body); }

  @Get(':id')
  get(@Param() { id }: RecordIdDto) { return this.items.get(id); }

  @Patch(':id')
  @Roles('ADMIN')
  update(@Param() { id }: RecordIdDto, @Body() body: UpdateItemDto) { return this.items.update(id, body); }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(204)
  deactivate(@Param() { id }: RecordIdDto) { return this.items.deactivate(id); }
}
