import { Module }           from '@nestjs/common';
import { AuthModule }       from '../auth/auth.module.js';
import { DocumentsModule }  from '../documents/documents.module.js';
import { SearchController } from './search.controller.js';
import { SearchService }    from './search.service.js';

@Module({ imports: [AuthModule, DocumentsModule], controllers: [SearchController], providers: [SearchService] })
export class SearchModule {}
