import { useState, type SubmitEvent } from 'react';
import type { CatalogChoice, Transaction, TransactionInput, TransactionType } from '../api/transactions';
import { Button, Field, Input } from './ui';
import { Actions, Fields, Message, Row, SectionTitle, Select, Stack } from './catalog.styles';
import CatalogPicker            from './catalog-picker';
import FormattedInput           from './formatted-input';
import styled                   from 'styled-components';

const Line = styled.fieldset`
  margin: 0;
  padding: 20px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  min-width: 0;
  legend { padding: 0 6px; font-weight: 600; }
`;

const LineFields = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) auto;
  align-items: start;
  gap: 16px;
  > button { align-self: end; }
  @media (max-width: 800px) { grid-template-columns: minmax(0, 1fr); }
`;

const Lines = styled(Stack)`
  padding: 0 28px 28px;
  gap: 16px;
  @media (max-width: 600px) { padding: 0 20px 20px; }
`;

type DraftLine = { key: string; itemId: number; name: string; quantity: string; unitPrice: string };
type Props = { entry?: Transaction; pending: boolean; onSave: (input: TransactionInput) => Promise<void>; onDirty: () => void };

const newLine = (): DraftLine => ({ key: crypto.randomUUID(), itemId: 0, name: '', quantity: '1', unitPrice: '' });

const today = (): string => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

const TransactionForm = ({ entry, pending, onSave, onDirty }: Props) => {
  const [type, setType]       = useState<TransactionType>(entry?.type ?? 'PURCHASE');
  const [partner, setPartner] = useState({ id: entry?.partnerId ?? 0, name: entry?.partnerName ?? '' });
  const [lines, setLines]     = useState<DraftLine[]>(() => entry?.lines.map(line => ({
    key: crypto.randomUUID(), itemId: line.itemId, name: `${line.itemNameSnapshot} · ${line.itemSkuSnapshot}`,
    quantity: line.quantity, unitPrice: line.unitPrice,
  })) ?? [newLine()]);
  const [error, setError] = useState('');

  const chooseItem = (key: string, item: CatalogChoice): void => {
    setLines(values => values.map(line => line.key === key ? {
      ...line, itemId: item.id, name: `${item.name} · ${item.sku}`,
      unitPrice: (type === 'PURCHASE' ? item.purchasePrice : item.salePrice) ?? '',
    } : line));
    onDirty();
  };

  const submit = async (event: SubmitEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!partner.id || lines.some(line => !line.itemId)) {
      setError('거래처와 모든 품목을 선택해주세요.');
      return;
    }
    if (new Set(lines.map(line => line.itemId)).size !== lines.length) {
      setError('같은 품목은 한 번만 추가해주세요.');
      return;
    }

    setError('');
    await onSave({
      type, partnerId: partner.id, occurredAt: String(form.get('occurredAt')), memo: String(form.get('memo')).trim() || null,
      lines: lines.map(line => ({
        itemId: line.itemId, quantity: String(form.get(`quantity-${line.key}`)).trim(),
        unitPrice: String(form.get(`price-${line.key}`)).replaceAll(',', '').trim(),
      })),
    });
  };

  return (
    <form onSubmit={submit}>
      <Fields disabled={pending}>
        <SectionTitle><h2>거래 정보</h2><p>거래처와 거래일을 입력해주세요.</p></SectionTitle>
        <Field>
          거래 종류
          <Select value={type} onChange={event => { setType(event.target.value as TransactionType); setPartner({ id: 0, name: '' }); onDirty(); }}>
            <option value="PURCHASE">매입</option><option value="SALE">매출</option>
          </Select>
        </Field>
        <Field>거래일<Input name="occurredAt" type="date" min="1000-01-01" max="9999-12-31" required defaultValue={entry?.occurredAt ?? today()} onChange={onDirty} /></Field>
        <CatalogPicker key={type} label="거래처" path="partners" role={type === 'PURCHASE' ? 'SUPPLIER' : 'CUSTOMER'}
          selected={partner.name} onSelect={value => { setPartner(value); onDirty(); }} />
        <Field>메모<Input name="memo" maxLength={1000} defaultValue={entry?.memo ?? ''} onChange={onDirty} /></Field>
        <SectionTitle><h2>거래 품목</h2><p>기준가는 선택 시 채워집니다. 실제 단가를 확인해주세요. 합계는 저장 후 반영됩니다.</p></SectionTitle>
      </Fields>
      <Lines>
        {lines.map((line, index) => (
          <Line key={line.key} disabled={pending}>
            <legend>품목 {index + 1}</legend>
            <LineFields>
              <CatalogPicker label="품목" path="items" selected={line.name} onSelect={value => chooseItem(line.key, value)} />
              <Field>수량<Input name={`quantity-${line.key}`} inputMode="decimal" required defaultValue={line.quantity}
                pattern="(?!0(?:\.0{1,3})?$)(0|[1-9][0-9]{0,8})(\.[0-9]{1,3})?" onChange={onDirty} /></Field>
              <Field>단가<FormattedInput key={`${line.itemId}:${line.unitPrice}`} name={`price-${line.key}`} format="money"
                inputMode="decimal" required defaultValue={line.unitPrice} onInput={onDirty} /></Field>
              <Button type="button" $variant="secondary" disabled={lines.length <= 1} onClick={() => { setLines(values => values.filter(value => value.key !== line.key)); onDirty(); }}>삭제</Button>
            </LineFields>
          </Line>
        ))}
        <Row><Button type="button" $variant="secondary" disabled={pending || lines.length >= 100} onClick={() => { setLines(values => [...values, newLine()]); onDirty(); }}>품목 추가</Button></Row>
        {error && <Message $error role="alert">{error}</Message>}
      </Lines>
      <Actions>
        <small>수량은 소수 3자리, 단가는 소수 2자리까지 입력할 수 있습니다.</small>
        <Button disabled={pending}>{pending ? '저장 중...' : '초안 저장'}</Button>
      </Actions>
    </form>
  );
};

export default TransactionForm;
