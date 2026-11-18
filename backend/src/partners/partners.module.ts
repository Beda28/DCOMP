import { Module }             from '@nestjs/common';
import { TypeOrmModule }      from '@nestjs/typeorm';
import { AuthModule }         from '../auth/auth.module.js';
import { Partner }            from './partner.entity.js';
import { PartnersController } from './partners.controller.js';
import { PartnersService }    from './partners.service.js';

@Module({
  imports:     [AuthModule, TypeOrmModule.forFeature([Partner])],
  controllers: [PartnersController],
  providers:   [PartnersService],
})
export class PartnersModule {}
