import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { correctDocument, documentFile, documentStatusLabel, getDocument, isProcessing, kindLabel, linkDocument, retryDocument, type DocumentDetail, type DocumentFields, type DocumentLinks as Links } from '../api/documents';
import { authMessage } from '../api/auth';
import { processingEnabled } from '../config';
import DocumentCorrection, { FormFields } from '../components/document-correction';
import DocumentHistory, { OriginalText } from '../components/document-history';
import DocumentLinks from '../components/document-links';
import { Button, Card, Title } from '../components/ui';
import { Badge, Breadcrumb, Heading, Message, Row, Stack } from '../components/catalog.styles';
import styled from 'styled-components';

const Preview = styled.div`
  img { display: block; max-width: 100%; max-height: 700px; margin: auto; object-fit: contain; }
  iframe { width: 100%; min-height: 600px; border: 0; }
`;

const DocumentPage = () => {
  const { id } = useParams();
  const [entry, setEntry]     = useState<DocumentDetail>();
  const [links, setLinks]     = useState<Links>({ partnerId: null, transactionId: null });
  const [pending, setPending] = useState(false);
  const [dirty, setDirty]     = useState(false);
  const [reload, setReload]   = useState(0);
  const [error, setError]     = useState('');
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setEntry(undefined); setError(''); setMessage(''); setDirty(false); setPreview('');
    if (id) getDocument(id, controller.signal).then(value => {
      if (!controller.signal.aborted) { setEntry(value); setLinks({ partnerId: value.partnerId, transactionId: value.transactionId }); }
    }).catch(error => { if (!controller.signal.aborted) setError(authMessage(error)); });
    return () => controller.abort();
  }, [id, reload]);

  const processing = processingEnabled && !!entry && entry.currentJobVersion > 0 && isProcessing(entry.status);
  useEffect(() => {
    if (!processing || !id) return;
    const controller = new AbortController();
    const timer = setInterval(() => {
      getDocument(id, controller.signal).then(value => {
        if (!controller.signal.aborted) setEntry(value);
      }).catch(error => { if (!controller.signal.aborted) setError(authMessage(error)); });
    }, 2500);
    return () => { clearInterval(timer); controller.abort(); };
  }, [id, processing]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent): void => { event.preventDefault(); event.returnValue = ''; };
    if (dirty) window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const mutate = async (action: () => Promise<DocumentDetail>, message: string): Promise<void> => {
    setPending(true); setError(''); setMessage('');
    try {
      const saved = await action();
      setEntry(saved); setLinks({ partnerId: saved.partnerId, transactionId: saved.transactionId }); setDirty(false); setMessage(message);
    }
    catch (error) { setError(authMessage(error)); }
    finally       { setPending(false); }
  };

  const showFile = async (download: boolean): Promise<void> => {
    if (!entry) return;
    setPending(true); setError('');
    try {
      const url = URL.createObjectURL(await documentFile(entry.id));
      if (download) {
        const anchor = document.createElement('a');
        anchor.href = url; anchor.download = entry.originalFilename; anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      else setPreview(url);
    }
    catch (error) { setError(authMessage(error)); }
    finally       { setPending(false); }
  };

  const save = async (text: string, fields: DocumentFields): Promise<void> => {
    if (entry) await mutate(() => correctDocument(entry, text, fields), '보정 내용을 저장했습니다.');
  };

  return <Stack>
    <Breadcrumb><Link to="/documents">문서</Link><span>/</span><span>상세</span></Breadcrumb>
    <Heading><Title>문서 상세</Title><Row>
      <Button $variant="secondary" disabled={pending} onClick={() => {
        if (!dirty || window.confirm('입력 중인 내용을 버리고 다시 불러올까요?')) setReload(value => value + 1);
      }}>다시 불러오기</Button><Button as={Link} to="/documents" $variant="secondary">목록</Button>
    </Row></Heading>
    {error && <Message $error role="alert">{error}</Message>}
    {message && <Message role="status">{message}</Message>}
    {!entry && !error && <p role="status">불러오는 중...</p>}
    {entry && <>
      <Card><Stack>
        <h2>{entry.originalFilename}</h2>
        <Row><Badge $active={entry.status === 'READY'}>{documentStatusLabel[entry.status]}</Badge><span>{kindLabel[entry.kind]} · {(Number(entry.sizeBytes) / 1024).toFixed(1)}KB</span></Row>
        {processing && <p role="status">문서를 처리하고 있습니다. 결과는 자동으로 갱신됩니다.</p>}
        {!processingEnabled && <p>자동 인식은 개발 보류 상태입니다. 원본을 확인하고 문서 내용을 직접 입력해주세요.</p>}
        {entry.jobs[0]?.errorMessage && <Message $error={entry.status === 'FAILED'}>{entry.jobs[0].errorMessage}</Message>}
        <Row>
          <Button $variant="secondary" disabled={pending} onClick={() => showFile(false)}>원본 미리보기</Button>
          <Button $variant="secondary" disabled={pending} onClick={() => showFile(true)}>원본 다운로드</Button>
          {processingEnabled && <Button $variant="secondary" disabled={pending || processing || dirty} onClick={() => mutate(() => retryDocument(entry), '재처리를 요청했습니다. 보정 내용은 유지됩니다.')}>OCR 재처리</Button>}
        </Row>
        {preview && <Preview>{entry.contentType === 'application/pdf' ? <iframe title="문서 원본" src={preview} sandbox="" /> : <img src={preview} alt="문서 원본" />}</Preview>}
      </Stack></Card>
      <Card><Stack>
        <h2>거래 연결</h2>
        <Row>{entry.transactionId && <Link to={`/transactions/${entry.transactionId}`}>연결 거래 보기</Link>}{entry.partnerId && <Link to={`/partners/${entry.partnerId}`}>연결 거래처 보기</Link>}</Row>
        <FormFields disabled={pending || processing || dirty}>
          <DocumentLinks key={`${entry.id}:${entry.revision}`} value={links} onChange={setLinks} />
          <Button disabled={links.partnerId === entry.partnerId && links.transactionId === entry.transactionId} onClick={() => mutate(() => linkDocument(entry, links), '문서 연결을 저장했습니다.')}>연결 저장</Button>
        </FormFields>
      </Stack></Card>
      <Card><details><summary>자동 인식 원문과 추출 항목</summary><OriginalText>{entry.ocrText ?? '인식 결과가 없습니다.'}</OriginalText>
        <p>상호: {entry.extractedJson?.title ?? '미확인'} · 날짜: {entry.extractedJson?.date ?? '미확인'} · 합계: {entry.extractedJson?.amount ?? '미확인'} · 사업자번호: {entry.extractedJson?.bizNumber ?? '미확인'}</p>
      </details></Card>
      {!processing && <Card><DocumentCorrection key={`${entry.id}:${entry.revision}`} entry={entry} pending={pending} onDirty={() => setDirty(true)} onSave={save} /></Card>}
      <Card><DocumentHistory id={entry.id} revision={entry.revision} /></Card>
      <Card><details><summary>처리 이력</summary>{entry.jobs.map(job => <p key={job.id}>처리 #{job.version} · {({ PENDING_ENQUEUE: '등록 대기', QUEUED: '처리 대기', PROCESSING: '처리 중', COMPLETED: '완료', FAILED: '실패' } as Record<string, string>)[job.status]} · 시도 {job.attempts}회 {job.errorMessage}</p>)}</details></Card>
    </>}
  </Stack>;
};

export default DocumentPage;
