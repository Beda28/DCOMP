import client from './client';

export type Status = 'ACTIVE' | 'INACTIVE';
export type PartnerRole = 'CUSTOMER' | 'SUPPLIER';
export type PartnerInput = {
  name: string; roles: PartnerRole[]; bizNumber: string | null; contact: string | null; email: string | null;
};
export type ItemInput = {
  sku: string; name: string; unit: string; purchasePrice: string | null; salePrice: string | null;
};
export type Partner = PartnerInput & { id: number; status: Status };
export type Item = ItemInput & { id: number; status: Status };
export type Query = { q: string; status: Status | ''; role?: PartnerRole | ''; page: number };
export type ListResult<T> = { data: T[]; meta: { page: number; limit: number; total: number } };

const catalogApi = <T, Input>(path: string) => ({
  async list(query: Query, signal: AbortSignal): Promise<ListResult<T>> {
    const params = { ...query, status: query.status || undefined, role: query.role || undefined, limit: 20 };
    return (await client.get<ListResult<T>>(path, { params, signal })).data;
  },

  async get(id: number, signal?: AbortSignal): Promise<T> {
    return (await client.get<{ data: T }>(`${path}/${id}`, { signal })).data.data;
  },

  async save(id: number | undefined, input: Input): Promise<T> {
    const response = id === undefined
      ? await client.post<{ data: T }>(path, input)
      : await client.patch<{ data: T }>(`${path}/${id}`, input);
    return response.data.data;
  },

  async deactivate(id: number): Promise<void> {
    await client.delete(`${path}/${id}`);
  },
});

export const partners = catalogApi<Partner, PartnerInput>('/partners');
export const items    = catalogApi<Item, ItemInput>('/items');
export type CatalogApi<T, Input> = ReturnType<typeof catalogApi<T, Input>>;

export type Choice = { id: number; name: string; sku?: string; partnerId?: number; purchasePrice?: string | null; salePrice?: string | null };

export const listChoices = async (path: 'partners' | 'items' | 'users' | 'transactions', q: string, page: number, role: string | undefined, signal: AbortSignal): Promise<ListResult<Choice>> => {
  const result = (await client.get<ListResult<Choice & { username?: string; number?: string; partnerName?: string }>>(`/${path}`, {
    params: { q, page, role, status: path === 'transactions' ? undefined : 'ACTIVE', limit: 10 }, signal,
  })).data;
  return { ...result, data: result.data.map(choice => ({ ...choice, name: choice.number ? `${choice.number} · ${choice.partnerName}` : choice.username ?? choice.name })) };
};
