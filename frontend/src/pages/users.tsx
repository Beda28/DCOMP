import { useEffect, useState, type SubmitEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { authMessage }              from '../api/auth';
import { clearSession, useSession } from '../api/session';
import { createUser, getUser, listUsers, resetPassword, updateUser, type StaffUser, type UserList } from '../api/users';
import { Button, Card, Field, Input, Title } from '../components/ui';
import { Actions, Badge, Breadcrumb, Empty, EntryLink, Fields, Filters, Heading, Message, Pagination, ResultHeader, Results, Row, SectionTitle, Select, Stack, Table } from '../components/catalog.styles';

const Users = () => {
  const { id }              = useParams();
  const { user }            = useSession();
  const [params, setParams] = useSearchParams();
  const navigate            = useNavigate();

  const [list, setList]       = useState<UserList | null>(null);
  const [entry, setEntry]     = useState<StaffUser | null>(null);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [message, setMessage] = useState('');

  const creating = id === 'new';
  const search   = params.toString();
  const page     = list?.meta.page ?? 1;
  const pages    = Math.max(1, Math.ceil((list?.meta.total ?? 0) / (list?.meta.limit ?? 20)));

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    setMessage('');
    setEntry(null);
    setList(null);
    setLoading(!creating);
    if (creating) return () => controller.abort();

    const load = id ? getUser(id, controller.signal).then(setEntry) : listUsers(new URLSearchParams(search), controller.signal).then(setList);
    load.catch(error => { if (!controller.signal.aborted) setError(authMessage(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });

    return () => controller.abort();
  }, [id, search, creating]);

  const save = async (event: SubmitEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const form     = event.currentTarget;
    const data     = new FormData(form);
    const password = String(data.get('password'));
    if (password !== data.get('confirm')) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    setPending(true);
    setError('');
    setMessage('');

    try {
      if (creating) {
        const created = await createUser(String(data.get('username')).trim(), password);
        navigate(`/settings/users/${created.id}`, { replace: true });
      }
      else if (entry) {
        await resetPassword(entry.id, password);
        if (entry.id === user?.id) {
          clearSession();
          navigate('/login', { replace: true, state: { username: user.username, message: '비밀번호가 변경되었습니다. 다시 로그인해주세요.' } });
        }
        else {
          form.reset();
          setMessage('비밀번호가 초기화되고 해당 계정의 모든 로그인이 해제되었습니다.');
        }
      }
    }
    catch (error) { setError(authMessage(error)); }
    finally       { setPending(false); }
  };

  const toggleStatus = async (): Promise<void> => {
    if (!entry) return;

    setPending(true);
    setError('');
    setMessage('');

    try {
      const updated = await updateUser(entry.id, entry.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE');
      setEntry(updated);
      setMessage(updated.status === 'ACTIVE' ? '계정이 활성화되었습니다.' : '계정이 비활성화되고 모든 로그인이 해제되었습니다.');
    }
    catch (error) { setError(authMessage(error)); }
    finally       { setPending(false); }
  };

  const filter = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    for (const key of ['q', 'status']) {
      const value = String(data.get(key) ?? '').trim();
      if (value) next.set(key, value);
    }

    setParams(next);
  };

  const changePage = (value: number): void => {
    const next = new URLSearchParams(params);
    next.set('page', String(value));
    setParams(next);
  };

  return (
    <Stack>
      <Breadcrumb aria-label="현재 위치">
        <Link to="/settings/company">회사</Link><span>/</span><Link to="/settings/users">직원 관리</Link>
        {id && <><span>/</span><span>{creating ? '등록' : '상세'}</span></>}
      </Breadcrumb>
      <Heading>
        <div>
          <Title>{creating ? '직원 등록' : id ? '직원 상세' : '직원 관리'}</Title>
          <p>{id ? '계정 정보와 로그인 권한을 관리합니다.' : '우리 회사의 관리자와 직원 계정입니다.'}</p>
        </div>
        {!id && <Button as={Link} to="/settings/users/new">직원 등록</Button>}
      </Heading>
      {error && <Message $error role="alert">{error}</Message>}
      {message && <Message role="status">{message}</Message>}
      {loading && <p role="status">불러오는 중...</p>}
      {!id && (
        <>
          <Card>
            <Filters key={search} $roles={false} onSubmit={filter}>
              <Field>아이디 검색<Input name="q" defaultValue={params.get('q') ?? ''} placeholder="아이디" maxLength={100} /></Field>
              <Field>
                상태
                <Select name="status" defaultValue={params.get('status') ?? ''}>
                  <option value="">전체</option><option value="ACTIVE">활성</option><option value="DISABLED">비활성</option>
                </Select>
              </Field>
              <Button $variant="secondary">검색</Button>
            </Filters>
          </Card>
          {list && (
            <Results>
              <ResultHeader><h2>계정 목록</h2><span>총 {list.meta.total}개</span></ResultHeader>
              {list.data.length ? (
                <Table>
                  <thead><tr><th>아이디</th><th>권한</th><th>상태</th></tr></thead>
                  <tbody>
                    {list.data.map(value => (
                      <tr key={value.id}>
                        <td><EntryLink to={`/settings/users/${value.id}`}>{value.username}</EntryLink></td>
                        <td>{value.role === 'ADMIN' ? '관리자' : '직원'}</td>
                        <td><Badge $active={value.status === 'ACTIVE'}>{value.status === 'ACTIVE' ? '활성' : '비활성'}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              ) : <Empty><p>검색 결과가 없습니다.</p></Empty>}
              <Pagination>
                <Button $variant="secondary" disabled={page <= 1} onClick={() => changePage(page - 1)}>이전</Button>
                <span>{page} / {pages}</span>
                <Button $variant="secondary" disabled={page >= pages} onClick={() => changePage(page + 1)}>다음</Button>
              </Pagination>
            </Results>
          )}
        </>
      )}
      {entry && (
        <Results>
          <Fields>
            <SectionTitle><h2>계정 정보</h2></SectionTitle>
            <Field>아이디<Input value={entry.username} readOnly /></Field>
            <Field>권한<Input value={entry.role === 'ADMIN' ? '관리자' : '직원'} readOnly /></Field>
          </Fields>
          <Actions>
            <Row>
              <Badge $active={entry.status === 'ACTIVE'}>{entry.status === 'ACTIVE' ? '활성' : '비활성'}</Badge>
              {entry.id === user?.id && <small>본인 계정은 비활성화할 수 없습니다.</small>}
            </Row>
            <Button $variant={entry.status === 'ACTIVE' ? 'danger' : 'secondary'} disabled={pending || entry.id === user?.id} onClick={toggleStatus}>
              {entry.status === 'ACTIVE' ? '비활성화' : '활성화'}
            </Button>
          </Actions>
        </Results>
      )}
      {(creating || entry) && (
        <Results as="form" onSubmit={save} key={id}>
          <Fields disabled={pending}>
            <SectionTitle>
              <h2>{creating ? '로그인 정보' : '비밀번호 초기화'}</h2>
              <p>{creating ? '직원에게 회사 코드와 로그인 정보를 전달해주세요.' : '변경하면 이 계정의 모든 로그인이 해제됩니다.'}</p>
            </SectionTitle>
            {creating && (
              <>
                <Field>아이디<Input name="username" autoComplete="off" autoCapitalize="none" spellCheck={false}
                  pattern="[A-Za-z0-9_]{3,32}" minLength={3} maxLength={32} required /></Field>
                <Field>권한<Input value="직원" readOnly /></Field>
              </>
            )}
            <Field>{creating ? '비밀번호' : '새 비밀번호'}<Input name="password" type="password" autoComplete="new-password" minLength={8} maxLength={256} required /></Field>
            <Field>비밀번호 확인<Input name="confirm" type="password" autoComplete="new-password" minLength={8} maxLength={256} required /></Field>
          </Fields>
          <Actions>
            <Button as={Link} to="/settings/users" $variant="secondary">목록</Button>
            <Button disabled={pending}>{pending ? '처리 중...' : creating ? '등록' : '비밀번호 초기화'}</Button>
          </Actions>
        </Results>
      )}
    </Stack>
  );
};

export default Users;
