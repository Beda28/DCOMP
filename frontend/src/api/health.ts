import client from './client';

export type Service = 'mysql' | 'redis' | 'fastapi';
export type Status  = 'ok' | 'error';
export type Health  = { status: Status; services: Record<Service, Status> };

type HealthResponse = { data: Health };
type HealthError    = { error: { details: { service: Service; status: Status }[] } };

export const health = async (signal?: AbortSignal): Promise<Health> => {
  const res = await client.get<HealthResponse | HealthError>('/health', {
    signal,
    validateStatus: status => status === 200 || status === 503,
  });

  if ('data' in res.data) return res.data.data;

  const services: Record<Service, Status> = { mysql: 'error', redis: 'error', fastapi: 'error' };
  for (const item of res.data.error.details) services[item.service] = item.status;

  return { status: 'error', services };
};
