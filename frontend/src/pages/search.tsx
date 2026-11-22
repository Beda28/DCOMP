import { useEffect, useState, type SubmitEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { searchDocuments, type SearchHit } from '../api/search';
import { documentStatusLabel, kindLabel } from '../api/documents';
import type { ListResult }  from '../api/catalog';
import { authMessage }      from '../api/auth';
import { processingEnabled } from '../config';
import CatalogPicker        from '../components/catalog-picker';
import { Button, Card, Field, Input, Title } from '../components/ui';
import { Badge, Breadcrumb, Empty, EntryLink, Heading, Message, Pagination, ResultHeader, Results, Row, Select, Stack } from '../components/catalog.styles';
import styled from 'styled-components';

const Filters = styled.form`
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: end;
  > label:first-child { grid-column: 1 / -1; }
  @media (max-width: 600px) { grid-template-columns: minmax(0, 1fr); }
`;

const Hit = styled.article`
  padding: 24px;
  border-bottom: 1px solid #e2e8f0;
  overflow-wrap: anywhere;
  h2 { font-size: 18px; margin: 0 0 12px; }
  p { line-height: 1.7; color: #475569; white-space: pre-wrap; }
`;

const SearchResults = () => {
  const [params, setParams]   = useSearchParams();
  const [result, setResult]   = useState<ListResult<SearchHit> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [attempt, setAttempt] = useState(0);
  const [partner, setPartner] = useState({ id: params.get('partnerId') ?? '', name: params.get('partnerId') ? `거래처 #${params.get('partnerId')}` : '' });
  const search = params.toString();
  const page   = result?.meta.page ?? 1;
  const pages  = Math.max(1, Math.ceil((result?.meta.total ?? 0) / (result?.meta.limit ?? 20)));

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams(search);
    const partnerId = query.get('partnerId') ?? '';
    setPartner(value => value.id === partnerId ? value : { id: partnerId, name: partnerId ? `거래처 #${partnerId}` : '' });
    setError(''); setResult(null);
    if (!query.get('q')) { setLoading(false); return; }
    setLoading(true);
    searchDocuments(query, controller.signal)
      .then(value => { if (!controller.signal.aborted) setResult(value); })
      .catch(error => { if (!controller.signal.aborted) setError(authMessage(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [search, attempt]);

  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    for (const key of ['q', 'kind', 'status', 'from', 'to']) {
      const value = String(data.get(key) ?? '').trim();
      if (value) next.set(key, value);
    }
    if (partner.id) next.set('partnerId', partner.id);
    setParams(next); setAttempt(value => value + 1);
  };

  const changePage = (page: number): void => {
    const next = new URLSearchParams(params); next.set('page', String(page)); setParams(next);
  };

  return <Stack>
    <Breadcrumb><Link to="/">홈</Link><span>/</span><span>검색</span></Breadcrumb>
    <Heading><div><Title>문서 검색</Title><p>파일명·인식 내용·보정 항목을 검색하고 관련도 순으로 확인합니다.</p></div></Heading>
    <Card><Filters key={search} onSubmit={submit}>
      <Field>검색어<Input name="q" required maxLength={160} defaultValue={params.get('q') ?? ''} placeholder="상호 · 품명 · 날짜 · 문서 내용" /></Field>
      <Field>문서 종류<Select name="kind" defaultValue={params.get('kind') ?? ''}><option value="">전체</option>{Object.entries(kindLabel).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</Select></Field>
      <Field>처리 상태<Select name="status" defaultValue={params.get('status') ?? ''}><option value="">전체</option>{Object.entries(documentStatusLabel).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</Select></Field>
      <Field>업로드 시작일<Input type="date" name="from" defaultValue={params.get('from') ?? ''} /></Field>
      <Field>업로드 종료일<Input type="date" name="to" defaultValue={params.get('to') ?? ''} /></Field>
      <div><CatalogPicker label="검색 거래처" path="partners" selected={partner.name} onSelect={choice => setPartner({ id: String(choice.id), name: choice.name })} />
        {partner.id && <Button type="button" $variant="secondary" onClick={() => setPartner({ id: '', name: '' })}>거래처 필터 해제</Button>}
      </div>
      <Button disabled={loading}>{loading ? '검색 중...' : '검색'}</Button>
    </Filters></Card>
    {error && <Message $error role="alert">{error}</Message>}
    {!params.get('q') && <p>찾을 문서의 단어를 입력해주세요.</p>}
    {result && <Results>
      <ResultHeader><h2>검색 결과</h2><span>총 {result.meta.total}건 · 관련도 순</span></ResultHeader>
      {result.data.length ? result.data.map(hit => <Hit key={hit.id}>
        <h2><EntryLink to={`/documents/${hit.id}`}>{hit.originalFilename}</EntryLink></h2>
        <Row><span>{kindLabel[hit.kind]}</span><Badge $active={hit.status === 'READY'}>{documentStatusLabel[hit.status]}</Badge></Row>
        <p>{hit.snippet}</p>
        {hit.transactionId && <Link to={`/transactions/${hit.transactionId}`}>연결 거래 보기</Link>}
      </Hit>) : <Empty><p>검색 결과가 없습니다.</p><small>다른 단어를 사용하거나 필터를 줄여보세요.</small></Empty>}
      <Pagination><Button $variant="secondary" disabled={page <= 1} onClick={() => changePage(page - 1)}>이전</Button><span>{page} / {pages}</span><Button $variant="secondary" disabled={page >= pages} onClick={() => changePage(page + 1)}>다음</Button></Pagination>
    </Results>}
  </Stack>;
};

const Search = () => processingEnabled ? <SearchResults /> : (
  <Card><Title>문서 관련도 검색</Title><p>개발 보류 상태입니다. 문서 목록에서 파일명과 직접 입력한 내용을 검색할 수 있습니다.</p><Link to="/documents">문서 목록</Link></Card>
);

export default Search;
