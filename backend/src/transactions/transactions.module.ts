import { Module }                 from '@nestjs/common';
import { TypeOrmModule }          from '@nestjs/typeorm';
import { AuthModule }             from '../auth/auth.module.js';
import { Transaction }            from './transaction.entity.js';
import { TransactionLine }        from './transaction-line.entity.js';
import { TransactionRead }        from './transaction-read.entity.js';
import { TransactionsController } from './transactions.controller.js';
import { TransactionsService }    from './transactions.service.js';

@Module({
  imports:     [AuthModule, TypeOrmModule.forFeature([Transaction, TransactionLine, TransactionRead])],
  controllers: [TransactionsController],
  providers:   [TransactionsService],
})
export class TransactionsModule {}
