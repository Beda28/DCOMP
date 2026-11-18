import { Body, Controller, Get, Header, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { CreateUserDto, ResetPasswordDto, UpdateUserDto, UserQueryDto } from './user.dto.js';
import { AuthGuard, type AuthRequest } from '../auth/auth.guard.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { OriginGuard }       from '../auth/origin.guard.js';
import { RecordIdDto }       from '../common/catalog.dto.js';
import { UsersService }      from './users.service.js';

@Controller('users')
@UseGuards(AuthGuard, OriginGuard, RolesGuard)
@Roles('ADMIN')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Req() request: AuthRequest, @Query() query: UserQueryDto) { return this.users.list(request.user.organizationId, query); }

  @Post()
  create(@Req() request: AuthRequest, @Body() body: CreateUserDto) { return this.users.create(request.user, body); }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  get(@Req() request: AuthRequest, @Param() { id }: RecordIdDto) { return this.users.get(request.user.organizationId, id); }

  @Patch(':id')
  update(@Req() request: AuthRequest, @Param() { id }: RecordIdDto, @Body() body: UpdateUserDto) { return this.users.update(request.user, id, body); }

  @Post(':id/reset-password')
  @HttpCode(204)
  resetPassword(@Req() request: AuthRequest, @Param() { id }: RecordIdDto, @Body() body: ResetPasswordDto) { return this.users.resetPassword(request.user, id, body); }
}
