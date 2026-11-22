import { useState, type SubmitEvent } from 'react';
import type { DocumentDetail, DocumentFields } from '../api/documents';
import { Button, Field, Input } from './ui';
import { Stack } from './catalog.styles';
import styled from 'styled-components';

const TextArea = styled.textarea`
  width: 100%;
  min-height: 200px;
  resize: vertical;
  padding: 12px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font: inherit;
  line-height: 1.6;
`;

export const FormFields = styled.fieldset`
  display: grid;
  gap: 20px;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
`;

type Props = { entry: DocumentDetail; pending: boolean; onDirty: () => void; onSave: (text: string, fields: DocumentFields) => Promise<void> };

const DocumentCorrection = ({ entry, pending, onDirty, onSave }: Props) => {
  const fields = entry.correctedJson ?? entry.extractedJson;
  const [text, setText] = useState(entry.correctedText ?? entry.ocrText ?? '');

  const submit = async (event: SubmitEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const field = (name: string): string | null => String(data.get(name) ?? '').trim() || null;
    await onSave(text, { date: field('date'), amount: field('amount'), title: field('title'), bizNumber: field('bizNumber') });
  };

  return <form onSubmit={submit} onChange={onDirty}>
    <FormFields disabled={pending}>
      <Stack>
        <h2>문서 내용 입력·수정</h2>
        <Field>상호<Input name="title" maxLength={160} defaultValue={fields?.title ?? ''} /></Field>
        <Field>문서 날짜<Input name="date" type="date" min="1000-01-01" max="9999-12-31" defaultValue={fields?.date ?? ''} /></Field>
        <Field>합계 금액<Input name="amount" inputMode="decimal" pattern="(0|[1-9][0-9]{0,17})(\.[0-9]{1,2})?" defaultValue={fields?.amount ?? ''} /></Field>
        <Field>사업자번호<Input name="bizNumber" placeholder="123-45-67890" pattern="[0-9]{3}-[0-9]{2}-[0-9]{5}" defaultValue={fields?.bizNumber ?? ''} /></Field>
        <Field>문서 내용<TextArea maxLength={100000} value={text} onChange={event => setText(event.target.value)} /></Field>
        <Button>보정 저장</Button>
      </Stack>
    </FormFields>
  </form>;
};

export default DocumentCorrection;
