import axios         from 'axios';
import client, { refreshAccessToken } from './client';
import { clearSession, finishRestore, getRevision, lockSession, setToken, setUser } from './session';
import type { User } from './session';

let restoring: Promise<void> | null = null;

export const signup = async (username: string, password: string): Promise<User> => {
  const response = await client.post<{ data: User }>('/auth/signup', { username, password });
  return response.data.data;
};

export const login = (username: string, password: string): Promise<void> => lockSession(async () => {
  const response = await client.post<{ data: { accessToken: string; user: User } }>('/auth/login', { username, password });
  setToken(response.data.data.accessToken);
  setUser(response.data.data.user);
});

export const restore = (): Promise<void> => {
  if (!restoring) {
    const revision = getRevision();
    restoring = (async () => {
      try {
        await refreshAccessToken();
        const response = await client.get<{ data: User }>('/auth/me');
        if (getRevision() === revision) setUser(response.data.data);
      }
      catch (error) {
        if (!axios.isAxiosError(error) || error.response?.status !== 401) throw error;
      }
      finally { finishRestore(); }
    })().finally(() => { restoring = null; });
  }
  return restoring;
};

export const logout = (): Promise<void> => lockSession(async () => {
  try { await client.post('/auth/logout'); }
  catch (error) {
    if (!axios.isAxiosError(error) || error.response?.status !== 401) throw error;
  }
  clearSession();
});

export const authMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 429) return '요청이 많습니다. 잠시 후 다시 시도해주세요.';
    const message: unknown = error.response?.data?.error?.message;
    if (typeof message === 'string') return message;
  }
  return '서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.';
};
