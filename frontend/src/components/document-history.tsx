import { useEffect, useState } from 'react';
import { documentEdits, type DocumentEdit, type DocumentFields } from '../api/documents';
import { authMessage } from '../api/auth';
import { Button }      from './ui';
import { Message, Pagination, Stack } from './catalog.styles';
import styled from 'styled-components';

export const OriginalText = styled.pre`
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font: inherit;
  line-height: 1.6;
  max-height: 360px;
  overflow-y: auto;
`;

const Values = ({ fields }: { fields: DocumentFields | null }) => <p>
  상호: {fields?.title ?? '미확인'} · 날짜: {fields?.date ?? '미확인'} · 금액: {fields?.amount ?? '미확인'} · 사업자번호: {fields?.bizNumber ?? '미확인'}
</p>;

const DocumentHistory = ({ id, revision }: { id: number; revision: number }) => {
  const [entries, setEntries] = useState<DocumentEdit[]>([]);
  const [page, setPage]       = useState(1);
  const [total, setTotal]     = useState(0);
  const [error, setError]     = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    documentEdits(id, page, controller.signal).then(result => {
      if (!controller.signal.aborted) { setEntries(result.data); setTotal(result.meta.total); }
    }).catch(error => { if (!controller.signal.aborted) setError(authMessage(error)); });
    return () => controller.abort();
  }, [id, page, revision]);

  return <Stack>
    <h2>보정 이력</h2>
    {error && <Message $error role="alert">{error}</Message>}
    {!entries.length && <p>보정 이력이 없습니다.</p>}
    {entries.map(edit => <details key={edit.id}>
      <summary>{new Date(edit.editedAt).toLocaleString('ko-KR')} · 수정 #{edit.revision} · 직원 #{edit.editorId}</summary>
      <h3>변경 전</h3><Values fields={edit.beforeJson} /><OriginalText>{edit.beforeText ?? '없음'}</OriginalText>
      <h3>변경 후</h3><Values fields={edit.afterJson} /><OriginalText>{edit.afterText ?? '없음'}</OriginalText>
    </details>)}
    {total > 10 && <Pagination><Button $variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>이전 이력</Button><span>{page} / {Math.ceil(total / 10)}</span><Button $variant="secondary" disabled={page * 10 >= total} onClick={() => setPage(page + 1)}>다음 이력</Button></Pagination>}
  </Stack>;
};

export default DocumentHistory;
