import { useRef, useState, type SubmitEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { uploadDocument, type DocumentKind, type DocumentLinks as Links } from '../api/documents';
import { authMessage }       from '../api/auth';
import DocumentLinks         from '../components/document-links';
import { FormFields }        from '../components/document-correction';
import { Button, Card, Field, Input, Title } from '../components/ui';
import { Breadcrumb, Message, Select, Stack } from '../components/catalog.styles';

const DocumentUpload = () => {
  const navigate = useNavigate();
  const key = useRef(crypto.randomUUID());
  const [links, setLinks]     = useState<Links>({ partnerId: null, transactionId: null });
  const [pending, setPending] = useState(false);
  const [error, setError]     = useState('');

  const submit = async (event: SubmitEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get('file');
    if (!(file instanceof File) || !file.size) { setError('파일을 선택해주세요.'); return; }
    if (file.size > 20 * 1024 * 1024) { setError('20MB 이하의 파일을 선택해주세요.'); return; }
    setError('');
    setPending(true);
    try {
      const saved = await uploadDocument(file, String(form.get('kind')) as DocumentKind, links, key.current);
      navigate(`/documents/${saved.id}`, { replace: true });
    }
    catch (error) { setError(authMessage(error)); }
    finally       { setPending(false); }
  };

  return <Stack>
    <Breadcrumb><Link to="/documents">문서</Link><span>/</span><span>업로드</span></Breadcrumb>
    <Title>문서 업로드</Title>
    <Card>
      <form onSubmit={submit} onChange={() => { key.current = crypto.randomUUID(); }}>
        <FormFields disabled={pending}>
          <Stack>
            <p>PNG·JPEG·PDF, 최대 20MB. PDF는 10페이지까지 처리합니다. 업로드 후 문자와 주요 항목을 자동으로 추출합니다.</p>
            <Field>문서 파일<Input name="file" type="file" accept="image/png,image/jpeg,application/pdf" required /></Field>
            <Field>문서 종류<Select name="kind"><option value="RECEIPT">영수증</option><option value="INVOICE">거래명세서</option><option value="OTHER">기타</option></Select></Field>
            <DocumentLinks value={links} onChange={value => { setLinks(value); key.current = crypto.randomUUID(); }} />
            {error && <Message $error role="alert">{error}</Message>}
            <Button>{pending ? '업로드 중...' : '업로드'}</Button>
          </Stack>
        </FormFields>
      </form>
    </Card>
  </Stack>;
};

export default DocumentUpload;
