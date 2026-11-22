import { Injectable }       from '@nestjs/common';
import { DataSource }       from 'typeorm';
import type { Profile }     from '../auth/user.entity.js';
import { apiError }         from '../common/api-error.js';
import { processingEnabled } from '../common/processing.js';
import { DocumentsService } from '../documents/documents.service.js';
import type { DocumentQueryDto } from '../documents/document.dto.js';

type SearchHit = { id: number; score: number; snippet: string };
type SearchResult = { data: SearchHit[]; total: number };

@Injectable()
export class SearchService {
  constructor(private readonly database: DataSource, private readonly documents: DocumentsService) {}

  async search(actor: Profile, query: DocumentQueryDto) {
    if (!processingEnabled()) throw apiError(501, 'PROCESSING_DISABLED', '관련도 검색은 개발 보류 상태입니다. 문서 목록의 검색을 이용해주세요.');
    if (!query.q?.trim()) throw apiError(400, 'VALIDATION_ERROR', '검색어를 입력해주세요.');
    const builder = this.documents.filters(actor, query);
    const size = await builder.clone().select('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(OCTET_LENGTH(document.original_filename) + OCTET_LENGTH(COALESCE(document.corrected_text, document.ocr_text, \'\')) + OCTET_LENGTH(COALESCE(document.corrected_json, document.extracted_json, \'\')) + 5), 0)', 'bytes')
      .getRawOne<{ count: string; bytes: string }>();
    if (Number(size?.count) > 5000 || Number(size?.bytes) > 8 * 1024 * 1024) {
      throw apiError(422, 'SEARCH_SCOPE_TOO_LARGE', '검색 범위가 넓습니다. 날짜·거래처·문서 종류로 범위를 좁혀주세요.');
    }
    const rows = await builder.orderBy('document.id', 'DESC').take(5001).getMany();
    const corpus = rows.map(row => {
      const fields = row.correctedJson ?? row.extractedJson;
      return { id: row.id, text: [row.originalFilename, fields?.title, fields?.date, fields?.amount, fields?.bizNumber, row.correctedText ?? row.ocrText].filter(value => value !== null && value !== undefined).join('\n') };
    });
    if (rows.length > 5000 || corpus.reduce((size, row) => size + Buffer.byteLength(row.text, 'utf8'), 0) > 8 * 1024 * 1024) {
      throw apiError(422, 'SEARCH_SCOPE_TOO_LARGE', '검색 범위가 넓습니다. 날짜·거래처·문서 종류로 범위를 좁혀주세요.');
    }
    if (!rows.length) return { data: [], meta: { page: query.page, limit: query.limit, total: 0 } };
    let result: SearchResult;
    try {
      const response = await fetch(`${process.env.FASTAPI_URL ?? 'http://localhost:8000'}/internal/search`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(8000),
        body: JSON.stringify({ query: query.q, documents: corpus, page: query.page, limit: query.limit }),
      });
      if (!response.ok) throw new Error('검색 서비스 응답 오류');
      result = await response.json() as SearchResult;
      if (!Array.isArray(result.data) || !Number.isSafeInteger(result.total) || result.total < 0
        || result.data.some(hit => !Number.isSafeInteger(hit.id) || !Number.isFinite(hit.score) || typeof hit.snippet !== 'string')) throw new Error('검색 결과 형식 오류');
    }
    catch { throw apiError(503, 'SEARCH_UNAVAILABLE', '검색 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해주세요.'); }

    const ids = result.data.map(hit => hit.id);
    const visible = ids.length ? await this.documents.query(this.database.manager, actor)
      .andWhere('document.id IN (:...ids)', { ids }).select(['document.id', 'document.revision']).getMany() : [];
    const revisions = new Map(visible.map(row => [row.id, row.revision]));
    const catalog = new Map(rows.map(row => [row.id, row]));
    const data = result.data.filter(hit => catalog.has(hit.id) && revisions.get(hit.id) === catalog.get(hit.id)!.revision).map(hit => {
      const row = catalog.get(hit.id)!;
      return { ...hit, originalFilename: row.originalFilename, kind: row.kind, status: row.status, transactionId: row.transactionId, partnerId: row.partnerId };
    });
    if (data.length !== result.data.length) throw apiError(409, 'SEARCH_CHANGED', '검색 중 문서가 변경되었습니다. 다시 검색해주세요.');
    return { data, meta: { page: query.page, limit: query.limit, total: result.total } };
  }
}
