import client              from './client';
import type { ListResult } from './catalog';
import type { DocumentKind, DocumentStatus } from './documents';

export type SearchHit = {
  id: number; originalFilename: string; kind: DocumentKind; status: DocumentStatus;
  transactionId: number | null; partnerId: number | null; score: number; snippet: string;
};

export const searchDocuments = async (params: URLSearchParams, signal?: AbortSignal): Promise<ListResult<SearchHit>> => (
  (await client.get<ListResult<SearchHit>>('/search/documents', { params, signal, timeout: 15000 })).data
);
