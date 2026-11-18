import client from './client';

export type StaffUser = { id: number; username: string; role: 'ADMIN' | 'STAFF'; status: 'ACTIVE' | 'DISABLED' };
export type UserList = { data: StaffUser[]; meta: { page: number; limit: number; total: number } };

export const listUsers = async (params: URLSearchParams, signal?: AbortSignal): Promise<UserList> => {
  const response = await client.get<UserList>('/users', { params, signal });
  return response.data;
};

export const getUser = async (id: string, signal?: AbortSignal): Promise<StaffUser> => {
  const response = await client.get<{ data: StaffUser }>(`/users/${id}`, { signal });
  return response.data.data;
};

export const createUser = async (username: string, password: string): Promise<StaffUser> => {
  const response = await client.post<{ data: StaffUser }>('/users', { username, password });
  return response.data.data;
};

export const updateUser = async (id: number, status: StaffUser['status']): Promise<StaffUser> => {
  const response = await client.patch<{ data: StaffUser }>(`/users/${id}`, { status });
  return response.data.data;
};

export const resetPassword = async (id: number, newPassword: string): Promise<void> => {
  await client.post(`/users/${id}/reset-password`, { newPassword });
};
