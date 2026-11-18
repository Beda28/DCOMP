import { Body, Controller, Get, Header, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthGuard, type AuthRequest } from '../auth/auth.guard.js';
import { OriginGuard }              from '../auth/origin.guard.js';
import { OrganizationsService }     from './organizations.service.js';
import { RegisterOrganizationDto }  from './organization.dto.js';

@Controller('organizations')
@UseGuards(OriginGuard, ThrottlerGuard)
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Post('register')
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  register(@Body() body: RegisterOrganizationDto) { return this.organizations.register(body); }

  @Get('me')
  @Header('Cache-Control', 'no-store')
  @UseGuards(AuthGuard)
  get(@Req() request: AuthRequest) { return this.organizations.get(request.user.organizationId); }
}
