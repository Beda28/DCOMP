import { useState } from 'react';
import type { DocumentLinks as Links } from '../api/documents';
import CatalogPicker from './catalog-picker';
import { Button }    from './ui';
import { Row, Stack } from './catalog.styles';

type Props = { value: Links; onChange: (value: Links) => void };

const DocumentLinks = ({ value, onChange }: Props) => {
  const [partner, setPartner]         = useState(value.partnerId ? `거래처 #${value.partnerId}` : '');
  const [transaction, setTransaction] = useState(value.transactionId ? `거래 #${value.transactionId}` : '');

  return <Stack>
    <CatalogPicker label="연결 거래" path="transactions" selected={transaction} onSelect={choice => {
      setTransaction(choice.name);
      setPartner(`거래처 #${choice.partnerId}`);
      onChange({ transactionId: choice.id, partnerId: choice.partnerId ?? null });
    }} />
    {!value.transactionId && <CatalogPicker label="연결 거래처" path="partners" selected={partner} onSelect={choice => {
      setPartner(choice.name);
      onChange({ transactionId: null, partnerId: choice.id });
    }} />}
    <Row>{(value.transactionId || value.partnerId) && <Button type="button" $variant="secondary" onClick={() => {
      onChange({ transactionId: null, partnerId: null }); setTransaction(''); setPartner('');
    }}>연결 비우기</Button>}</Row>
  </Stack>;
};

export default DocumentLinks;
