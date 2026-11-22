import { useState }             from 'react';
import type { Transaction }     from '../api/transactions';
import { Button, Field, Input } from './ui';
import { Fields, Row }          from './catalog.styles';
import CatalogPicker            from './catalog-picker';

type Props = {
  entry: Transaction;
  admin: boolean;
  disabled: boolean;
  onAssign: (id: number) => Promise<void>;
};

const TransactionAssignee = ({ entry, admin, disabled, onAssign }: Props) => {
  const [choice, setChoice] = useState({ id: entry.assigneeId, name: entry.assigneeName });

  return (
    <Fields disabled={disabled}>
      <Field>작성자<Input value={entry.creatorName} readOnly /></Field>
      {admin ? (
        <div>
          <CatalogPicker label="담당 직원" path="users" selected={choice.name} onSelect={setChoice} />
          {choice.id !== entry.assigneeId && <Row><Button type="button" onClick={() => onAssign(choice.id)}>담당자 적용</Button></Row>}
        </div>
      ) : <Field>담당 직원<Input value={entry.assigneeName} readOnly /></Field>}
    </Fields>
  );
};

export default TransactionAssignee;
