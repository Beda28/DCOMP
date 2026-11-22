import client              from './client';
import type { ListResult } from './catalog';

export type DocumentKind = 'RECEIPT' | 'INVOICE' | 'OTHER';
export type DocumentStatus = 'UPLOADED' | 'QUEUED' | 'PROCESSING' | 'READY' | 'FAILED';
export type DocumentFields = { date: string | null; amount: string | null; title: string | null; bizNumber: string | null };
export type DocumentSummary = {
  id: number; kind: DocumentKind; originalFilename: string; contentType: string; sizeBytes: string;
  status: DocumentStatus; revision: number; partnerId: number | null; transactionId: number | null; uploadedBy: number; createdAt: string;
};
export type DocumentJob = {
  id: number; version: number; status: string; attempts: number; errorMessage: string | null; createdAt: string;
};
export type DocumentDetail = DocumentSummary & {
  ocrText: string | null; correctedText: string | null; extractedJson: DocumentFields | null;
  correctedJson: DocumentFields | null; currentJobVersion: number; processedAt: string | null; jobs: DocumentJob[];
};
export type DocumentEdit = {
  id: number; revision: number; editorId: number; beforeText: string | null; afterText: string | null;
  beforeJson: DocumentFields | null; afterJson: DocumentFields | null; editedAt: string;
};
export type DocumentLinks = { partnerId: number | null; transactionId: number | null };

export const kindLabel = { RECEIPT: '영수증', INVOICE: '거래명세서', OTHER: '기타' };
export const documentStatusLabel = { UPLOADED: '등록 대기', QUEUED: '처리 대기', PROCESSING: '처리 중', READY: '처리 완료', FAILED: '처리 실패' };
export const isProcessing = (status: DocumentStatus): boolean => ['UPLOADED', 'QUEUED', 'PROCESSING'].includes(status);

export const listDocuments = async (params: URLSearchParams, signal?: AbortSignal): Promise<ListResult<DocumentSummary>> => (
  (await client.get<ListResult<DocumentSummary>>('/documents', { params, signal })).data
);

export const getDocument = async (id: string | number, signal?: AbortSignal): Promise<DocumentDetail> => (
  (await client.get<{ data: DocumentDetail }>(`/documents/${id}`, { signal })).data.data
);

export const uploadDocument = async (file: File, kind: DocumentKind, links: DocumentLinks, key: string): Promise<DocumentDetail> => {
  const form = new FormData();
  form.set('file', file);
  form.set('kind', kind);
  if (links.partnerId) form.set('partnerId', String(links.partnerId));
  if (links.transactionId) form.set('transactionId', String(links.transactionId));
  return (await client.post<{ data: DocumentDetail }>('/documents', form, { timeout: 60000, headers: { 'Idempotency-Key': key } })).data.data;
};

export const correctDocument = async (entry: DocumentDetail, correctedText: string, correctedJson: DocumentFields): Promise<DocumentDetail> => (
  (await client.patch<{ data: DocumentDetail }>(`/documents/${entry.id}/corrections`, { correctedText, correctedJson, expectedRevision: entry.revision })).data.data
);

export const linkDocument = async (entry: DocumentDetail, links: DocumentLinks): Promise<DocumentDetail> => (
  (await client.patch<{ data: DocumentDetail }>(`/documents/${entry.id}/links`, { ...links, expectedRevision: entry.revision })).data.data
);

export const retryDocument = async (entry: DocumentDetail): Promise<DocumentDetail> => (
  (await client.post<{ data: DocumentDetail }>(`/documents/${entry.id}/retry`, { expectedRevision: entry.revision })).data.data
);

export const documentEdits = async (id: number, page: number, signal?: AbortSignal): Promise<ListResult<DocumentEdit>> => (
  (await client.get<ListResult<DocumentEdit>>(`/documents/${id}/edits`, { params: { page, limit: 10 }, signal })).data
);

export const documentFile = async (id: number, signal?: AbortSignal): Promise<Blob> => (
  (await client.get<Blob>(`/documents/${id}/file`, { responseType: 'blob', timeout: 60000, signal })).data
);
