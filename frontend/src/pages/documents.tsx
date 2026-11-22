import { useEffect, useState, type SubmitEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { documentStatusLabel, kindLabel, listDocuments, type DocumentSummary } from '../api/documents';
import type { ListResult } from '../api/catalog';
import { authMessage }     from '../api/auth';
import { processingEnabled } from '../config';
import { Button, Card, Field, Input, Title } from '../components/ui';
import { Badge, Breadcrumb, Empty, EntryLink, Heading, Message, Pagination, ResultHeader, Results, Row, Select, Stack, Table } from '../components/catalog.styles';
import styled from 'styled-components';

const Filters = styled.form`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  align-items: end;
  @media (max-width: 700px) { grid-template-columns: minmax(0, 1fr); }
`;

const Scroll = styled.div`
  overflow-x: auto;
  table { min-width: 600px; }
`;

const Documents = () => {
  const [params, setParams]   = useSearchParams();
  const [result, setResult]   = useState<ListResult<DocumentSummary> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [reload, setReload]   = useState(0);
  const search = params.toString();
  const page   = result?.meta.page ?? 1;
  const pages  = Math.max(1, Math.ceil((result?.meta.total ?? 0) / (result?.meta.limit ?? 20)));

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams(search);
    if (!processingEnabled && query.has('status')) {
      query.delete('status');
      setParams(query, { replace: true });
      return;
    }
    setLoading(true); setError(''); setResult(null);
    listDocuments(query, controller.signal)
      .then(value => {
        if (controller.signal.aborted) return;
        const last = Math.max(1, Math.ceil(value.meta.total / value.meta.limit));
        if (value.meta.page > last) {
          query.set('page', String(last));
          setParams(query, { replace: true });
          return;
        }
        setResult(value);
      })
      .catch(error => { if (!controller.signal.aborted) setError(authMessage(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [search, reload, setParams]);

  const filter = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    for (const key of ['q', 'kind', 'status', 'from', 'to', 'transactionId', 'partnerId']) {
      const value = String(data.get(key) ?? '').trim();
      if (value) next.set(key, value);
    }
    setParams(next); setReload(value => value + 1);
  };

  const changePage = (page: number): void => {
    const next = new URLSearchParams(params); next.set('page', String(page)); setParams(next);
  };

  const clearLinks = (): void => {
    const next = new URLSearchParams(params);
    for (const key of ['transactionId', 'partnerId', 'page']) next.delete(key);
    setParams(next);
  };

  return <Stack>
    <Breadcrumb><Link to="/">홈</Link><span>/</span><span>문서</span></Breadcrumb>
    <Heading><div><Title>문서 관리</Title><p>업로드한 문서 원본과 거래 연결 정보를 확인합니다.</p></div>
      <Row><Button $variant="secondary" disabled={loading} onClick={() => setReload(value => value + 1)}>새로고침</Button><Button as={Link} to="/documents/new">문서 업로드</Button></Row>
    </Heading>
    <Card><Filters key={search} onSubmit={filter}>
      <Field>검색<Input name="q" maxLength={160} defaultValue={params.get('q') ?? ''} placeholder="파일명 · 문서 내용" /></Field>
      <Field>문서 종류<Select name="kind" defaultValue={params.get('kind') ?? ''}><option value="">전체</option>{Object.entries(kindLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></Field>
      {processingEnabled && <Field>처리 상태<Select name="status" defaultValue={params.get('status') ?? ''}><option value="">전체</option>{Object.entries(documentStatusLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></Field>}
      <Field>업로드 시작일<Input type="date" name="from" defaultValue={params.get('from') ?? ''} /></Field>
      <Field>업로드 종료일<Input type="date" name="to" defaultValue={params.get('to') ?? ''} /></Field>
      <input type="hidden" name="transactionId" value={params.get('transactionId') ?? ''} />
      <input type="hidden" name="partnerId" value={params.get('partnerId') ?? ''} />
      <Row><Button $variant="secondary" disabled={loading}>검색</Button><Button type="button" $variant="secondary" onClick={() => { setParams({}); setReload(value => value + 1); }}>초기화</Button></Row>
      {(params.has('transactionId') || params.has('partnerId')) && <Row><span>연결된 문서만 조회 중입니다.</span><Button type="button" $variant="secondary" onClick={clearLinks}>연결 필터 해제</Button></Row>}
    </Filters></Card>
    {error && <Message $error role="alert">{error}</Message>}
    {loading && <p role="status">불러오는 중...</p>}
    {result && <Results>
      <ResultHeader><h2>문서 목록</h2><span>총 {result.meta.total}건</span></ResultHeader>
      {result.data.length ? <Scroll><Table>
        <thead><tr><th>파일명</th><th>종류</th>{processingEnabled && <th>처리 상태</th>}<th>업로드일</th></tr></thead>
        <tbody>{result.data.map(entry => <tr key={entry.id}>
          <td><EntryLink to={`/documents/${entry.id}`}>{entry.originalFilename}</EntryLink></td>
          <td>{kindLabel[entry.kind]}</td>{processingEnabled && <td><Badge $active={entry.status === 'READY'}>{documentStatusLabel[entry.status]}</Badge></td>}
          <td>{new Date(entry.createdAt).toLocaleDateString('ko-KR')}</td>
        </tr>)}</tbody>
      </Table></Scroll> : <Empty><p>조회 결과가 없습니다.</p></Empty>}
      <Pagination><Button $variant="secondary" disabled={page <= 1} onClick={() => changePage(page - 1)}>이전</Button><span>{page} / {pages}</span><Button $variant="secondary" disabled={page >= pages} onClick={() => changePage(page + 1)}>다음</Button></Pagination>
    </Results>}
  </Stack>;
};

export default Documents;
