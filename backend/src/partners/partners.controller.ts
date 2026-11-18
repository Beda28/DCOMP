import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { CreatePartnerDto, PartnerQueryDto, UpdatePartnerDto } from './partner.dto.js';
import { AuthGuard, type AuthRequest } from '../auth/auth.guard.js';
import { OriginGuard }     from '../auth/origin.guard.js';
import { RecordIdDto }     from '../common/catalog.dto.js';
import { PartnersService } from './partners.service.js';

@Controller('partners')
@UseGuards(AuthGuard, OriginGuard)
export class PartnersController {
  constructor(private readonly partners: PartnersService) {}

  @Get()
  list(@Req() request: AuthRequest, @Query() query: PartnerQueryDto) { return this.partners.list(request.user.organizationId, query); }

  @Post()
  create(@Req() request: AuthRequest, @Body() body: CreatePartnerDto) { return this.partners.create(request.user.organizationId, body); }

  @Get(':id')
  get(@Req() request: AuthRequest, @Param() { id }: RecordIdDto) { return this.partners.get(request.user.organizationId, id); }

  @Patch(':id')
  update(@Req() request: AuthRequest, @Param() { id }: RecordIdDto, @Body() body: UpdatePartnerDto) { return this.partners.update(request.user, id, body); }

  @Delete(':id')
  @HttpCode(204)
  deactivate(@Req() request: AuthRequest, @Param() { id }: RecordIdDto) { return this.partners.deactivate(request.user, id); }
}
