import type { ComponentProps } from 'react';
import { Input }               from './ui';

type Format = 'business' | 'phone' | 'money';
type Props = Omit<ComponentProps<'input'>, 'defaultValue'> & { format: Format; defaultValue?: string };

export const formatValue = (value: string, format: Format): string => {
  const text = value.normalize('NFKC').trim();
  if (!text) return '';

  if (format === 'money') {
    const raw = text.replaceAll(',', '');
    if (!/^\d*(\.\d{0,2})?$/.test(raw) || !/\d/.test(raw)) return text;
    const [whole, fraction = ''] = raw.split('.');
    const integer                = (whole || '0').replace(/^0+(?=\d)/, '');
    return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction.padEnd(2, '0')}`;
  }

  const digits = text.replace(/[\s-]/g, '');
  if (format === 'business') return /^\d{10}$/.test(digits) ? digits.replace(/^(\d{3})(\d{2})(\d{5})$/, '$1-$2-$3') : text;
  if (/^02\d{7,8}$/.test(digits)) return digits.replace(/^(02)(\d{3,4})(\d{4})$/, '$1-$2-$3');
  if (/^0\d{9,10}$/.test(digits)) return digits.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3');
  if (/^1\d{7}$/.test(digits)) return digits.replace(/^(\d{4})(\d{4})$/, '$1-$2');
  return text;
};

const FormattedInput = ({ format, defaultValue = '', ...props }: Props) => (
  <Input {...props} defaultValue={formatValue(defaultValue, format)}
    pattern={format === 'business' ? '[0-9]{10}|[0-9]{3}-[0-9]{2}-[0-9]{5}' : format === 'money'
      ? '([0-9]{1,13}|[0-9]{1,3}(,[0-9]{3}){1,3}|[0-9](,[0-9]{3}){4})(\\.[0-9]{1,2})?' : undefined}
    onBlur={event => { event.currentTarget.value = formatValue(event.currentTarget.value, format); }}
    onKeyDown={event => {
      if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.currentTarget.value = formatValue(event.currentTarget.value, format);
    }}
    onChange={event => event.currentTarget.setCustomValidity('')}
    onInvalid={event => {
      event.currentTarget.setCustomValidity(format === 'business'
        ? '사업자등록번호는 숫자 10자리로 입력해주세요.'
        : '금액은 0 이상, 정수 13자리·소수점 2자리까지 입력해주세요.');
    }}
  />
);

export default FormattedInput;
