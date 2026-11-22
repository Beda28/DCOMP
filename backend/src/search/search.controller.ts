import { Controller, Get, Header, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthRequest } from '../auth/auth.guard.js';
import { DocumentQueryDto } from '../documents/document.dto.js';
import { SearchService }    from './search.service.js';

@Controller('search')
@UseGuards(AuthGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('documents')
  @Header('Cache-Control', 'no-store')
  search(@Req() request: AuthRequest, @Query() query: DocumentQueryDto) { return this.searchService.search(request.user, query); }
}
