import axios from 'axios';
import { clearSession, getRevision, getToken, lockSession, setToken } from './session';

let refreshing: Promise<void> | null = null;

const client = axios.create({
  baseURL: '/api/v1',
  timeout: 5000,
  headers: { 'X-Requested-With': 'XMLHttpRequest' },
});

export const refreshAccessToken = (): Promise<void> => {
  if (!refreshing) {
    const revision = getRevision();
    refreshing = lockSession(async () => {
      try {
        const response = await client.post<{ data: { accessToken: string } }>('/auth/refresh');
        if (getRevision() === revision) setToken(response.data.data.accessToken);
      }
      catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 401 && getRevision() === revision) clearSession();
        throw error;
      }
    }).finally(() => { refreshing = null; });
  }
  return refreshing;
};

client.interceptors.request.use(config => {
  (config as typeof config & { sessionRevision: number }).sessionRevision = getRevision();
  const accessToken = getToken();
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  else config.headers.delete('Authorization');
  return config;
});

client.interceptors.response.use(response => response, async (error: unknown) => {
  if (!axios.isAxiosError(error) || !error.config || error.response?.status !== 401) throw error;

  const config = error.config as typeof error.config & { retried?: boolean; sessionRevision?: number };
  if (['/auth/login', '/organizations/register', '/auth/refresh', '/auth/logout'].includes(config.url ?? '')) throw error;
  if (config.sessionRevision !== getRevision()) throw error;
  if (config.retried) {
    clearSession();
    throw error;
  }

  config.retried = true;
  await refreshAccessToken();
  if (config.sessionRevision !== getRevision()) throw error;
  return client(config);
});

export default client;
