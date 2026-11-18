import { QueryFailedError } from 'typeorm';
import { apiError }         from './api-error.js';

export const searchPattern = (query: string): string => `%${query.replace(/[=%_]/g, '=$&')}%`;

export const duplicateError = (error: unknown, code: string, message: string): never => {
  if (error instanceof QueryFailedError && error.driverError.code === 'ER_DUP_ENTRY') throw apiError(409, code, message);
  throw error;
};

export const requireChanges = (changes: object): void => {
  if (!Object.values(changes).some(value => value !== undefined)) throw apiError(400, 'VALIDATION_ERROR', '수정할 값을 입력해주세요.');
};
