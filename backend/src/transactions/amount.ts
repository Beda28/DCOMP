import { apiError } from '../common/api-error.js';

export const scaled = (value: string, scale: number): bigint => {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole + fraction.padEnd(scale, '0'));
};

export const money = (cents: bigint): string => {
  if (cents > 99999999999999999999n) throw apiError(400, 'VALIDATION_ERROR', '거래 금액이 허용 범위를 초과했습니다.');
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`;
};

export const lineAmount = (quantity: string, unitPrice: string): string => (
  // 수량은 3자리, 단가는 2자리 고정소수점으로 곱하고 금액의 소수 셋째 자리에서 반올림한다.
  money((scaled(quantity, 3) * scaled(unitPrice, 2) + 500n) / 1000n)
);
