import { useSyncExternalStore } from 'react';

export type User = { id: number; username: string; role: 'ADMIN' | 'STAFF' };

let token: string | null = null;
let revision = 0;
let state = { user: null as User | null, ready: false };
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const snapshot = () => state;

export const useSession  = () => useSyncExternalStore(subscribe, snapshot);
export const getToken    = () => token;
export const getRevision = () => revision;
export const setToken    = (value: string | null): void => { token = value; };

export const setUser = (user: User | null): void => {
  revision++;
  state = { user, ready: true };
  listeners.forEach(listener => listener());
};

export const finishRestore = (): void => {
  state = { ...state, ready: true };
  listeners.forEach(listener => listener());
};

export const lockSession = <T,>(action: () => Promise<T>): Promise<T> => (
  navigator.locks ? navigator.locks.request('dcomp-auth', action) : action()
);

const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('dcomp-auth');

export const clearSession = (broadcast = true): void => {
  token = null;
  setUser(null);
  if (broadcast) channel?.postMessage('logout');
};

if (channel) channel.onmessage = () => clearSession(false);
