import { useEffect, useState } from 'react';
import { findChoices, type CatalogChoice } from '../api/transactions';
import { Button, Input }       from './ui';
import { Message, Row }        from './catalog.styles';
import { authMessage }         from '../api/auth';
import styled                  from 'styled-components';

const Picker = styled.div`
  display: grid;
  gap: 10px;
  min-width: 0;
  color: #334155;
  font-size: 14px;
  > span { font-weight: 500; }
`;

const Choices = styled.div`
  display: grid;
  gap: 6px;
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  button { text-align: left; white-space: normal; }
`;

type Props = {
  label: string;
  path: 'partners' | 'items' | 'users' | 'transactions';
  selected: string;
  role?: string;
  onSelect: (choice: CatalogChoice) => void;
};

const CatalogPicker = ({ label, path, selected, role, onSelect }: Props) => {
  const [open, setOpen]       = useState(false);
  const [query, setQuery]     = useState('');
  const [page, setPage]       = useState(1);
  const [choices, setChoices] = useState<CatalogChoice[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');

    const timer = setTimeout(() => {
      findChoices(path, query, page, role, controller.signal).then(result => {
        if (controller.signal.aborted) return;
        setChoices(result.data);
        setTotal(result.meta.total);
      }).catch(error => { if (!controller.signal.aborted) setError(authMessage(error)); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 200);

    return () => { clearTimeout(timer); controller.abort(); };
  }, [open, path, query, page, role]);

  return (
    <Picker role="group" aria-label={label}>
      <span>{label}</span>
      <Row>
        <span>{selected || '선택해주세요.'}</span>
        <Button type="button" $variant="secondary" aria-expanded={open} onClick={() => setOpen(value => !value)}>
          {open ? '닫기' : selected ? '변경' : '선택'}
        </Button>
      </Row>
      {open && (
        <Choices>
          <Input type="search" aria-label={`${label} 검색`} placeholder="이름으로 검색" maxLength={160}
            value={query} onChange={event => { setQuery(event.target.value); setPage(1); }}
            onKeyDown={event => { if (event.key === 'Enter') event.preventDefault(); }} />
          {error && <Message $error role="alert">{error}</Message>}
          {loading ? <small role="status">불러오는 중...</small> : !error && (
            <>
              {choices.map(choice => (
                <Button key={choice.id} type="button" $variant="secondary" onClick={() => { onSelect(choice); setOpen(false); }}>
                  {choice.name}{choice.sku ? ` · ${choice.sku}` : ''}
                </Button>
              ))}
              {!choices.length && <small>선택할 항목이 없습니다.</small>}
              <Row>
                <Button type="button" $variant="secondary" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>이전</Button>
                <small>{page} / {Math.max(1, Math.ceil(total / 10))}</small>
                <Button type="button" $variant="secondary" disabled={page * 10 >= total} onClick={() => setPage(value => value + 1)}>다음</Button>
              </Row>
            </>
          )}
        </Choices>
      )}
    </Picker>
  );
};

export default CatalogPicker;
