import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CreatePartnerDto, PartnerQueryDto, UpdatePartnerDto } from './partner.dto.js';
import { AuthGuard }         from '../auth/auth.guard.js';
import { OriginGuard }       from '../auth/origin.guard.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { RecordIdDto }       from '../common/catalog.dto.js';
import { PartnersService }   from './partners.service.js';

@Controller('partners')
@UseGuards(AuthGuard, OriginGuard, RolesGuard)
export class PartnersController {
  constructor(private readonly partners: PartnersService) {}

  @Get()
  list(@Query() query: PartnerQueryDto) { return this.partners.list(query); }

  @Post()
  create(@Body() body: CreatePartnerDto) { return this.partners.create(body); }

  @Get(':id')
  get(@Param() { id }: RecordIdDto) { return this.partners.get(id); }

  @Patch(':id')
  update(@Param() { id }: RecordIdDto, @Body() body: UpdatePartnerDto) { return this.partners.update(id, body); }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(204)
  deactivate(@Param() { id }: RecordIdDto) { return this.partners.deactivate(id); }
}
