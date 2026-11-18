import { HttpException } from '@nestjs/common';

export const apiError = (status: number, code: string, message: string): HttpException => (
  new HttpException({ error: { code, message, details: [] } }, status)
);
