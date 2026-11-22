import { Body, Controller, Get, Header, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AssignTransactionDto, CreateTransactionDto, TransactionQueryDto, TransactionStateDto, UpdateTransactionDto } from './transaction.dto.js';
import { AuthGuard, type AuthRequest } from '../auth/auth.guard.js';
import { OriginGuard }         from '../auth/origin.guard.js';
import { RecordIdDto }         from '../common/catalog.dto.js';
import { TransactionsService } from './transactions.service.js';

@Controller('transactions')
@UseGuards(AuthGuard, OriginGuard)
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Req() request: AuthRequest, @Query() query: TransactionQueryDto) { return this.transactions.list(request.user, query); }

  @Post()
  create(@Req() request: AuthRequest, @Body() body: CreateTransactionDto) { return this.transactions.create(request.user, body); }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  get(@Req() request: AuthRequest, @Param() { id }: RecordIdDto) { return this.transactions.get(request.user, id); }

  @Patch(':id/assignee')
  assign(@Req() request: AuthRequest, @Param() { id }: RecordIdDto, @Body() body: AssignTransactionDto) { return this.transactions.assign(request.user, id, body); }

  @Post(':id/read')
  @HttpCode(204)
  read(@Req() request: AuthRequest, @Param() { id }: RecordIdDto) { return this.transactions.markRead(request.user, id); }

  @Patch(':id')
  update(@Req() request: AuthRequest, @Param() { id }: RecordIdDto, @Body() body: UpdateTransactionDto) { return this.transactions.update(request.user, id, body); }

  @Post(':id/confirm')
  @HttpCode(200)
  confirm(@Req() request: AuthRequest, @Param() { id }: RecordIdDto, @Body() body: TransactionStateDto) { return this.transactions.confirm(request.user, id, body.expectedRevision); }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Req() request: AuthRequest, @Param() { id }: RecordIdDto, @Body() body: TransactionStateDto) { return this.transactions.cancel(request.user, id, body.expectedRevision); }
}
