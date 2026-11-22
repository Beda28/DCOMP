import { useEffect, useState, type SubmitEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { listTransactions, statusLabel, typeLabel, type TransactionSummary } from '../api/transactions';
import type { ListResult }       from '../api/catalog';
import { authMessage }           from '../api/auth';
import { useSession }            from '../api/session';
import { Button, Card, Field, Input, Title } from '../components/ui';
import { Badge, Breadcrumb, Empty, EntryLink, Heading, Message, Pagination, ResultHeader, Results, Select, Stack, Table } from '../components/catalog.styles';
import styled                    from 'styled-components';

const Filters = styled.form<{ $admin: boolean }>`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  align-items: end;
  gap: 16px;
  > label:first-child { grid-column: span 2; }
  > button { grid-column: ${({ $admin }) => $admin ? 'auto' : 'span 2'}; }
  @media (max-width: 900px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    > label:first-child, > button { grid-column: 1 / -1; }
  }
  @media (max-width: 600px) { grid-template-columns: minmax(0, 1fr); }
`;

const TransactionTable = styled(Table)`
  th:first-child { width: 24%; }
  th:last-child { width: 18%; }
  @media (max-width: 700px) { min-width: 760px; }
`;

const Scroll = styled.div`
  overflow-x: auto;
`;

const Transactions = () => {
  const { user }             = useSession();
  const [params, setParams]   = useSearchParams();
  const [result, setResult]   = useState<ListResult<TransactionSummary> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const search = params.toString();
  const page   = result?.meta.page ?? 1;
  const pages  = Math.max(1, Math.ceil((result?.meta.total ?? 0) / (result?.meta.limit ?? 20)));

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setResult(null);

    listTransactions(new URLSearchParams(search), controller.signal)
      .then(value => { if (!controller.signal.aborted) setResult(value); })
      .catch(error => { if (!controller.signal.aborted) setError(authMessage(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });

    return () => controller.abort();
  }, [search]);

  const filter = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    for (const key of ['q', 'type', 'status', 'from', 'to', 'assigneeId']) {
      const value = String(data.get(key) ?? '').trim();
      if (value) next.set(key, value);
    }

    setParams(next);
  };

  const changePage = (page: number): void => {
    const next = new URLSearchParams(params);
    next.set('page', String(page));
    setParams(next);
  };

  return (
    <Stack>
      <Breadcrumb aria-label="현재 위치"><Link to="/">홈</Link><span>/</span><span>거래</span></Breadcrumb>
      <Heading>
        <div><Title>매입·매출</Title><p>거래 초안을 작성하고 확정·취소 이력을 확인합니다.</p></div>
        <Button as={Link} to="/transactions/new">거래 등록</Button>
      </Heading>
      <Card>
        <Filters key={search} $admin={user?.role === 'ADMIN'} onSubmit={filter}>
          <Field>검색<Input name="q" maxLength={160} defaultValue={params.get('q') ?? ''} placeholder="거래번호 · 거래처명 · 메모" /></Field>
          <Field>거래 종류<Select name="type" defaultValue={params.get('type') ?? ''}>
            <option value="">전체</option><option value="PURCHASE">매입</option><option value="SALE">매출</option>
          </Select></Field>
          <Field>상태<Select name="status" defaultValue={params.get('status') ?? ''}>
            <option value="">전체</option><option value="DRAFT">초안</option><option value="CONFIRMED">확정</option><option value="CANCELED">취소</option>
          </Select></Field>
          <Field>시작일<Input name="from" type="date" min="1000-01-01" max="9999-12-31" defaultValue={params.get('from') ?? ''} /></Field>
          <Field>종료일<Input name="to" type="date" min="1000-01-01" max="9999-12-31" defaultValue={params.get('to') ?? ''} /></Field>
          {user?.role === 'ADMIN' && <Field>담당 범위<Select name="assigneeId" defaultValue={params.get('assigneeId') ?? ''}>
            <option value="">전체</option><option value={user.id}>내 담당</option>
          </Select></Field>}
          <Button $variant="secondary">검색</Button>
        </Filters>
      </Card>
      {error && <Message $error role="alert">{error}</Message>}
      {loading && <p role="status">불러오는 중...</p>}
      {result && (
        <Results>
          <ResultHeader><h2>거래 목록</h2><span>총 {result.meta.total}건</span></ResultHeader>
          {result.data.length ? (
            <Scroll>
              <TransactionTable>
                <thead><tr><th>거래번호</th><th>거래일</th><th>종류</th><th>거래처</th><th>담당 직원</th><th>상태</th><th>합계</th></tr></thead>
                <tbody>{result.data.map(entry => (
                  <tr key={entry.id}>
                    <td><EntryLink to={`/transactions/${entry.id}`}>{entry.number}</EntryLink> {entry.isUnread && <Badge $active aria-label="미열람 거래">NEW</Badge>}</td>
                    <td>{entry.occurredAt}</td><td>{typeLabel[entry.type]}</td><td>{entry.partnerName}</td>
                    <td>{entry.assigneeName}</td>
                    <td><Badge $active={entry.status === 'CONFIRMED'}>{statusLabel[entry.status]}</Badge></td>
                    <td>{entry.totalAmount}</td>
                  </tr>
                ))}</tbody>
              </TransactionTable>
            </Scroll>
          ) : <Empty><p>조회 결과가 없습니다.</p></Empty>}
          <Pagination>
            <Button $variant="secondary" disabled={page <= 1} onClick={() => changePage(page - 1)}>이전</Button>
            <span>{page} / {pages}</span>
            <Button $variant="secondary" disabled={page >= pages} onClick={() => changePage(page + 1)}>다음</Button>
          </Pagination>
        </Results>
      )}
    </Stack>
  );
};

export default Transactions;
