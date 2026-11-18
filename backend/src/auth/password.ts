import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const cost   = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const derive = (password: string, salt: string): Promise<Buffer> => new Promise((resolve, reject) => {
  scrypt(password, salt, 64, cost, (error, key) => error ? reject(error) : resolve(key));
});

export const hash = async (password: string): Promise<string> => {
  const salt = randomBytes(16).toString('hex');
  const key  = await derive(password, salt);
  return `${salt}:${key.toString('hex')}`;
};

export const verify = async (password: string, stored?: string): Promise<boolean> => {
  const valid        = typeof stored === 'string' && /^[a-f\d]{32}:[a-f\d]{128}$/.test(stored);
  const [salt, value] = valid ? stored.split(':') : ['0'.repeat(32), '0'.repeat(128)];
  const key          = await derive(password, salt);
  return timingSafeEqual(Buffer.from(value, 'hex'), key) && valid;
};
