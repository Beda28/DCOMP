import client              from './client';
import type { ListResult } from './catalog';

export type TransactionType = 'PURCHASE' | 'SALE';
export type TransactionStatus = 'DRAFT' | 'CONFIRMED' | 'CANCELED';
export type LineInput = { itemId: number; quantity: string; unitPrice: string };
export type TransactionInput = {
  type: TransactionType; partnerId: number; occurredAt: string; memo: string | null; lines: LineInput[];
};
export type TransactionLine = LineInput & {
  id: number; position: number; lineAmount: string; itemSkuSnapshot: string; itemNameSnapshot: string;
};
export type TransactionSummary = {
  id: number; number: string; type: TransactionType; partnerId: number; partnerName: string;
  occurredAt: string; status: TransactionStatus; totalAmount: string; revision: number; memo: string | null;
  confirmedAt: string | null; canceledAt: string | null;
  createdBy: number; creatorName: string; assigneeId: number; assigneeName: string; isUnread: boolean;
};
export type Transaction = TransactionSummary & { lines: TransactionLine[] };
export type CatalogChoice = { id: number; name: string; sku?: string; purchasePrice?: string | null; salePrice?: string | null };

export const typeLabel = { PURCHASE: '매입', SALE: '매출' };
export const statusLabel = { DRAFT: '초안', CONFIRMED: '확정', CANCELED: '취소' };

export const listTransactions = async (params: URLSearchParams, signal: AbortSignal): Promise<ListResult<TransactionSummary>> => (
  (await client.get<ListResult<TransactionSummary>>('/transactions', { params, signal })).data
);

export const getTransaction = async (id: string, signal?: AbortSignal): Promise<Transaction> => (
  (await client.get<{ data: Transaction }>(`/transactions/${id}`, { signal })).data.data
);

export const saveTransaction = async (input: TransactionInput, entry?: Transaction): Promise<Transaction> => {
  const response = entry
    ? await client.patch<{ data: Transaction }>(`/transactions/${entry.id}`, { ...input, expectedRevision: entry.revision })
    : await client.post<{ data: Transaction }>('/transactions', input);
  return response.data.data;
};

export const changeTransactionStatus = async (id: number, action: 'confirm' | 'cancel'): Promise<Transaction> => (
  (await client.post<{ data: Transaction }>(`/transactions/${id}/${action}`)).data.data
);

export const assignTransaction = async (entry: Transaction, assigneeId: number): Promise<Transaction> => (
  (await client.patch<{ data: Transaction }>(`/transactions/${entry.id}/assignee`, { assigneeId, expectedRevision: entry.revision })).data.data
);

export const markTransactionRead = async (id: number, signal?: AbortSignal): Promise<void> => {
  await client.post(`/transactions/${id}/read`, undefined, { signal });
};

export const findChoices = async (path: 'partners' | 'items' | 'users', q: string, page: number, role: string | undefined, signal: AbortSignal): Promise<ListResult<CatalogChoice>> => {
  const result = (await client.get<ListResult<CatalogChoice & { username?: string }>>(`/${path}`, {
    params: { q, page, role, status: 'ACTIVE', limit: 10 }, signal,
  })).data;
  return { ...result, data: result.data.map(choice => ({ ...choice, name: choice.username ?? choice.name })) };
};
