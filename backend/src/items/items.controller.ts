import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ListQueryDto, RecordIdDto } from '../common/catalog.dto.js';
import { CreateItemDto, UpdateItemDto } from './item.dto.js';
import { AuthGuard, type AuthRequest } from '../auth/auth.guard.js';
import { OriginGuard }       from '../auth/origin.guard.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { ItemsService }      from './items.service.js';

@Controller('items')
@UseGuards(AuthGuard, OriginGuard, RolesGuard)
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Get()
  list(@Req() request: AuthRequest, @Query() query: ListQueryDto) { return this.items.list(request.user.organizationId, query); }

  @Post()
  @Roles('ADMIN')
  create(@Req() request: AuthRequest, @Body() body: CreateItemDto) { return this.items.create(request.user.organizationId, body); }

  @Get(':id')
  get(@Req() request: AuthRequest, @Param() { id }: RecordIdDto) { return this.items.get(request.user.organizationId, id); }

  @Patch(':id')
  update(@Req() request: AuthRequest, @Param() { id }: RecordIdDto, @Body() body: UpdateItemDto) { return this.items.update(request.user, id, body); }

  @Delete(':id')
  @HttpCode(204)
  deactivate(@Req() request: AuthRequest, @Param() { id }: RecordIdDto) { return this.items.deactivate(request.user, id); }
}
