import { useEffect, useMemo, useState, type SubmitEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { CatalogApi, ListResult, Query, Status } from '../api/catalog';
import { Actions, Badge, Breadcrumb, Empty, EntryLink, Fields, Filters, Heading, Message, Pagination, ResultHeader, Results, Row, Select, Stack, Table } from './catalog.styles';
import { authMessage } from '../api/auth';
import { Button, Card, Field, Input, Title } from './ui';

type Record = { id: number; name: string; status: Status };

type Props<T, Input> = {
  title: string;
  path:  string;
  api:   CatalogApi<T, Input>;

  canEdit:       boolean;
  canDeactivate: boolean;
  roleFilter?:   boolean;

  summary: (record: T) => ReactNode;
  fields:  (record?: T) => ReactNode;
  values:  (form: FormData) => Input;
};

const Catalog = <T extends Record, Input>({ title, path, api, canEdit, canDeactivate, roleFilter, summary, fields, values }: Props<T, Input>) => {
  const { id }              = useParams();
  const [params, setParams] = useSearchParams();
  const location            = useLocation();
  const navigate            = useNavigate();

  const [result, setResult]     = useState<ListResult<T> | null>(null);
  const [selected, setSelected] = useState<T | null>(null);
  const [loading, setLoading]   = useState(true);
  const [pending, setPending]   = useState(false);
  const [error, setError]       = useState('');

  const creating = id === 'new';
  const listUrl  = `${path}${location.search}`;
  const notice   = typeof location.state?.notice === 'string' ? location.state.notice : '';
  const query = useMemo<Query>(() => ({
    q:      params.get('q') ?? '',
    status: (params.get('status') ?? 'ACTIVE') as Query['status'],
    role:   (params.get('role') ?? '') as Query['role'],
    page:   Number(params.get('page') ?? 1),
  }), [params]);

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    setSelected(null);
    if (creating) {
      setLoading(false);
      return () => controller.abort();
    }

    setLoading(true);
    const request = id
      ? api.get(Number(id), controller.signal).then(data => { if (!controller.signal.aborted) setSelected(data); })
      : api.list(query, controller.signal).then(data => { if (!controller.signal.aborted) setResult(data); });
    request.catch(error => {
      if (!controller.signal.aborted) { setResult(null); setError(authMessage(error)); }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });

    return () => controller.abort();
  }, [api, id, creating, query]);

  const save = async (event: SubmitEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!canEdit || (!creating && !selected)) return;

    const form = new FormData(event.currentTarget);
    if (roleFilter && !form.getAll('roles').length) {
      setError('고객사 또는 공급사를 선택해주세요.');
      return;
    }

    setPending(true);
    setError('');

    try {
      await api.save(creating ? undefined : selected!.id, values(form));
      navigate(listUrl, { replace: true, state: { notice: '저장했습니다.' } });
    }
    catch (error) { setError(authMessage(error)); }
    finally       { setPending(false); }
  };

  const deactivate = async (): Promise<void> => {
    if (!selected || !window.confirm(`${selected.name}을(를) 비활성화할까요?`)) return;

    setPending(true);
    setError('');

    try {
      await api.deactivate(selected.id);
      const next = new URLSearchParams(params);
      next.set('page', '1');
      navigate(`${path}?${next}`, { replace: true, state: { notice: '비활성화했습니다.' } });
    }
    catch (error) { setError(authMessage(error)); }
    finally       { setPending(false); }
  };

  const search = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = new URLSearchParams({ q: String(form.get('q') ?? '').trim(), status: String(form.get('status') ?? ''), page: '1' });
    if (roleFilter) next.set('role', String(form.get('role') ?? ''));
    setParams(next, { state: null });
  };

  const movePage = (page: number): void => {
    const next = new URLSearchParams(params);
    next.set('page', String(page));
    setParams(next, { state: null });
  };

  return (
    <Stack>
      <Breadcrumb aria-label="현재 위치">
        <Link to="/">홈</Link><span>/</span>
        {id ? <><Link to={listUrl}>{title}</Link><span>/</span><span aria-current="page">{creating ? '등록' : '상세'}</span></> : <span aria-current="page">{title}</span>}
      </Breadcrumb>
      <Heading>
        <div>
          <Title>{id ? `${title} ${creating ? '등록' : '상세'}` : title}</Title>
          <p>{id ? (creating ? `${title} 정보를 입력해주세요.` : '등록된 정보를 확인하고 관리합니다.') : (roleFilter ? '고객사와 공급사 정보를 관리합니다.' : '품목 정보와 매입·매출 기준가를 관리합니다.')}</p>
        </div>
        {id ? <Button $variant="secondary" disabled={pending} onClick={() => navigate(listUrl)}>목록으로</Button>
          : canEdit && <Button onClick={() => navigate(`${path}/new${location.search}`)}>{title} 등록</Button>}
      </Heading>
      {error && <Message $error role="alert">{error}</Message>}
      {!id && notice && <Message role="status">{notice}</Message>}
      {id ? (
        creating && !canEdit ? <Message $error role="alert">등록 권한이 없습니다.</Message> : loading ? <Empty role="status">정보 불러오는 중...</Empty> : (creating || selected) && (
          <Results>
            <ResultHeader>
              <h2>{creating ? '새 정보 입력' : selected!.name}</h2>
              {selected && <Badge $active={selected.status === 'ACTIVE'}>{selected.status === 'ACTIVE' ? '활성' : '비활성'}</Badge>}
            </ResultHeader>
            <form key={id} onSubmit={save}>
              <Fields disabled={!canEdit || pending}>{fields(selected ?? undefined)}</Fields>
              <Actions>
                <div>{canDeactivate && selected?.status === 'ACTIVE' && <Button $variant="danger" type="button" disabled={pending} onClick={deactivate}>비활성화</Button>}</div>
                <Row>
                  <Button $variant="secondary" type="button" disabled={pending} onClick={() => navigate(listUrl)}>{canEdit ? '취소' : '목록으로'}</Button>
                  {canEdit && <Button type="submit" disabled={pending}>{pending ? '저장 중...' : '저장'}</Button>}
                </Row>
              </Actions>
            </form>
          </Results>
        )
      ) : <>
        <Card>
          <Filters key={location.search} $roles={!!roleFilter} onSubmit={search}>
            <Field>검색<Input name="q" maxLength={160} defaultValue={query.q} placeholder={roleFilter ? '거래처명으로 검색' : '품목명 또는 SKU로 검색'} /></Field>
            <Field>상태<Select name="status" defaultValue={query.status}><option value="ACTIVE">활성</option><option value="INACTIVE">비활성</option><option value="">전체</option></Select></Field>
            {roleFilter && <Field>거래처 역할<Select name="role" defaultValue={query.role}><option value="">전체</option><option value="CUSTOMER">고객사</option><option value="SUPPLIER">공급사</option></Select></Field>}
            <Button type="submit" $variant="secondary">검색</Button>
          </Filters>
        </Card>
        <Results aria-label={`${title} 목록`}>
          <ResultHeader><h2>{title} 목록</h2><span>{!loading && result ? `총 ${result.meta.total}개` : '조회 중'}</span></ResultHeader>
          {loading ? <Empty role="status">목록 불러오는 중...</Empty> : result ? <>
            {result.data.length ? <Table>
              <thead><tr><th scope="col">{title}명</th><th scope="col">{roleFilter ? '구분' : 'SKU · 단위'}</th><th scope="col">상태</th></tr></thead>
              <tbody>{result.data.map(record => <tr key={record.id}>
                <td><EntryLink to={`${path}/${record.id}${location.search}`}>{record.name}</EntryLink></td>
                <td>{summary(record)}</td>
                <td><Badge $active={record.status === 'ACTIVE'}>{record.status === 'ACTIVE' ? '활성' : '비활성'}</Badge></td>
              </tr>)}</tbody>
            </Table> : <Empty><p>조회 결과가 없습니다.</p><small>{canEdit ? `검색 조건을 바꾸거나 새 ${title}를 등록해주세요.` : '검색 조건을 변경해보세요.'}</small></Empty>}
            <Pagination>
              <Button $variant="secondary" disabled={query.page <= 1} onClick={() => movePage(query.page - 1)}>이전</Button>
              <span>{query.page} / {Math.max(1, Math.ceil(result.meta.total / result.meta.limit))}</span>
              <Button $variant="secondary" disabled={query.page * result.meta.limit >= result.meta.total} onClick={() => movePage(query.page + 1)}>다음</Button>
            </Pagination>
          </> : <Empty>목록을 불러오지 못했습니다. 다시 검색해주세요.</Empty>}
        </Results>
      </>}
    </Stack>
  );
};

export default Catalog;
