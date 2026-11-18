import client from './client';

export type Organization = { id: number; name: string; code: string; status: 'ACTIVE' | 'DISABLED' };

export const registerOrganization = async (companyName: string, username: string, password: string) => {
  const response = await client.post<{ data: { organization: Pick<Organization, 'id' | 'name' | 'code'>; admin: { id: number; username: string; role: 'ADMIN' } } }>(
    '/organizations/register', { companyName, username, password },
  );
  return response.data.data;
};

export const getOrganization = async (signal?: AbortSignal): Promise<Organization> => {
  const response = await client.get<{ data: Organization }>('/organizations/me', { signal });
  return response.data.data;
};
