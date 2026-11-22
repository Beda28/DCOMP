import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { assignTransaction, setStatus, getTransaction, markRead, saveTransaction, statusLabel, typeLabel, type Transaction, type TransactionInput } from '../api/transactions';
import { Button, Field, Input, Title } from '../components/ui';
import { Actions, Badge, Breadcrumb, Fields, Heading, Message, Results, Row, Stack, Table } from '../components/catalog.styles';
import { authMessage }         from '../api/auth';
import { useSession }          from '../api/session';
import TransactionForm         from '../components/transaction-form';
import TransactionAssignee     from '../components/transaction-assignee';
import styled                  from 'styled-components';

const Summary = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  padding: 20px 28px;
  border-bottom: 1px solid #e2e8f0;
  overflow-wrap: anywhere;
`;

const LineTable = styled(Table)`
  th:first-child { width: 34%; }
  th:last-child { width: 24%; }
  @media (max-width: 600px) { min-width: 640px; }
`;

const Scroll = styled.div`
  overflow-x: auto;
`;

const TransactionPage = () => {
  const { id }   = useParams();
  const { user } = useSession();
  const navigate = useNavigate();

  const [entry, setEntry]     = useState<Transaction>();
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [dirty, setDirty]     = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [error, setError]     = useState('');
  const [message, setMessage] = useState('');
  const creating             = id === 'new';

  useEffect(() => {
    const controller = new AbortController();
    setEntry(undefined);
    setDirty(false);
    setError('');
    setMessage('');
    setLoading(!creating);
    if (creating || !id) return () => controller.abort();

    getTransaction(id, controller.signal)
      .then(async value => {
        if (controller.signal.aborted) return;
        setEntry(value);
        await markRead(value.id, controller.signal);
      })
      .catch(error => { if (!controller.signal.aborted) setError(authMessage(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });

    return () => controller.abort();
  }, [id, creating, attempt]);

  const save = async (input: TransactionInput): Promise<void> => {
    setPending(true);
    setError('');
    setMessage('');

    try {
      const saved = await saveTransaction(input, entry);
      if (creating) navigate(`/transactions/${saved.id}`, { replace: true });
      else {
        setEntry(saved);
        setDirty(false);
        setMessage('초안을 저장했습니다.');
      }
    }
    catch (error) { setError(authMessage(error)); }
    finally       { setPending(false); }
  };

  const changeStatus = async (action: 'confirm' | 'cancel'): Promise<void> => {
    if (!entry || !window.confirm(action === 'confirm' ? '거래를 확정할까요? 확정 후에는 수정할 수 없습니다.' : '거래를 취소할까요? 기록은 보존됩니다.')) return;

    setPending(true);
    setError('');
    setMessage('');

    try {
      setEntry(await setStatus(entry, action));
      setDirty(false);
      setMessage(action === 'confirm' ? '거래를 확정했습니다.' : '거래를 취소했습니다.');
    }
    catch (error) { setError(authMessage(error)); }
    finally       { setPending(false); }
  };

  const reload = (): void => {
    if (dirty && !window.confirm('입력 중인 내용을 버리고 다시 불러올까요?')) return;
    setAttempt(value => value + 1);
  };

  const assign = async (assigneeId: number): Promise<void> => {
    if (!entry) return;
    setPending(true);
    setError('');
    setMessage('');

    try {
      setEntry(await assignTransaction(entry, assigneeId));
      setMessage('담당자를 변경했습니다.');
    }
    catch (error) { setError(authMessage(error)); }
    finally       { setPending(false); }
  };

  return (
    <Stack>
      <Breadcrumb aria-label="현재 위치"><Link to="/transactions">거래</Link><span>/</span><span>{creating ? '등록' : '상세'}</span></Breadcrumb>
      <Heading>
        <div><Title>{creating ? '거래 등록' : '거래 상세'}</Title><p>{creating ? '매입·매출 거래를 초안으로 저장합니다.' : '초안을 수정하거나 거래 상태를 변경합니다.'}</p></div>
        <Row>
          {entry && <Button as={Link} to={`/documents?transactionId=${entry.id}`} $variant="secondary">연결 문서</Button>}
          {!creating && <Button $variant="secondary" disabled={pending || loading} onClick={reload}>다시 불러오기</Button>}
          <Button as={Link} to="/transactions" $variant="secondary">목록</Button>
        </Row>
      </Heading>
      {error && <Message $error role="alert">{error}</Message>}
      {message && <Message role="status">{message}</Message>}
      {loading && <p role="status">불러오는 중...</p>}
      {(creating || entry) && (
        <Results>
          {entry && <Summary><span>{entry.number}</span><Badge $active={entry.status === 'CONFIRMED'}>{statusLabel[entry.status]}</Badge><span>합계 {entry.totalAmount}</span></Summary>}
          {entry && <TransactionAssignee key={`${entry.id}:${entry.assigneeId}`} entry={entry} admin={user?.role === 'ADMIN'} disabled={pending || dirty} onAssign={assign} />}
          {creating || entry?.status === 'DRAFT' ? (
            <TransactionForm key={`${id}:${entry?.revision ?? 0}`} entry={entry} pending={pending} onSave={save} onDirty={() => setDirty(true)} />
          ) : entry && (
            <>
              <Fields>
                <Field>거래 종류<Input value={typeLabel[entry.type]} readOnly /></Field>
                <Field>거래일<Input value={entry.occurredAt} readOnly /></Field>
                <Field>거래처<Input value={entry.partnerName} readOnly /></Field>
                <Field>메모<Input value={entry.memo ?? ''} readOnly /></Field>
              </Fields>
              <Scroll>
                <LineTable>
                  <thead><tr><th>품목</th><th>수량</th><th>단가</th><th>금액</th></tr></thead>
                  <tbody>{entry.lines.map(line => (
                    <tr key={line.id}>
                      <td>{line.itemNameSnapshot}<br /><small>{line.itemSkuSnapshot}</small></td>
                      <td>{line.quantity}</td><td>{line.unitPrice}</td><td>{line.lineAmount}</td>
                    </tr>
                  ))}</tbody>
                </LineTable>
              </Scroll>
            </>
          )}
          {entry && entry.status !== 'CANCELED' && (
            <Actions>
              <small>{dirty ? '변경사항을 저장한 뒤 상태를 변경해주세요.' : entry.status === 'DRAFT' ? '확정 후에는 내용을 수정할 수 없습니다.' : '확정된 거래입니다.'}</small>
              <Row>
                {user?.role === 'ADMIN' && <Button $variant="danger" disabled={pending || dirty} onClick={() => changeStatus('cancel')}>거래 취소</Button>}
                {entry.status === 'DRAFT' && <Button disabled={pending || dirty} onClick={() => changeStatus('confirm')}>거래 확정</Button>}
              </Row>
            </Actions>
          )}
        </Results>
      )}
    </Stack>
  );
};

export default TransactionPage;
