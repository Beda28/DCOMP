import { useState, type SubmitEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import styled                   from 'styled-components';
import { authMessage, login }   from '../api/auth';
import { registerOrganization } from '../api/organization';
import { useSession }           from '../api/session';
import { Button, Card, Field, Input, Title } from './ui';

const Form = styled.form`
  display: grid;
  gap: 16px;
  margin-top: 24px;
`;

const AuthForm = ({ mode }: { mode: 'login' | 'start' }) => {
  const { user, ready } = useSession();
  const navigate        = useNavigate();
  const location        = useLocation();

  const [pending, setPending] = useState(false);
  const [error, setError]     = useState('');

  const joining     = mode === 'start';
  const title       = joining ? '회사 등록' : '로그인';
  const companyCode = typeof location.state?.companyCode === 'string' ? location.state.companyCode : '';
  const registered  = typeof location.state?.username === 'string' ? location.state.username : '';
  const notice      = typeof location.state?.message === 'string' ? location.state.message : '';

  const submit = async (event: SubmitEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const data     = new FormData(event.currentTarget);
    const username = String(data.get('username')).trim();
    const password = String(data.get('password'));
    if (joining && password !== data.get('confirm')) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    setPending(true);
    setError('');
    let createdCode = '';

    try {
      if (joining) {
        const result = await registerOrganization(String(data.get('companyName')).trim(), username, password);
        createdCode = result.organization.code;
      }
      await login(createdCode || String(data.get('companyCode')).trim(), username, password);
      navigate(joining ? '/settings/company' : '/', { replace: true, state: { registered: joining } });
    }
    catch (error) {
      if (createdCode) {
        navigate('/login', { replace: true, state: {
          username, companyCode: createdCode,
          message: `회사 등록이 완료되었습니다. 회사 코드: ${createdCode}. 로그인을 다시 시도해주세요. ${authMessage(error)}`,
        } });
      }
      else setError(authMessage(error));
    }
    finally { setPending(false); }
  };

  if (!ready) return <p role="status">로그인 확인 중...</p>;
  if (user) return <Navigate to="/" replace />;

  return (
    <Card>
      <Title>{title}</Title>
      {joining && <p>회사를 등록하고 첫 관리자 계정을 만듭니다.</p>}
      {!joining && notice && <p role="alert">{notice}</p>}
      <Form onSubmit={submit}>
        {joining ? (
          <Field>회사명<Input name="companyName" autoComplete="organization" maxLength={160} required disabled={pending} /></Field>
        ) : (
          <Field>회사 코드<Input name="companyCode" inputMode="numeric" autoComplete="off" pattern="[0-9]{6}"
            minLength={6} maxLength={6} defaultValue={companyCode} placeholder="6자리 숫자" required disabled={pending} /></Field>
        )}
        <Field>
          아이디
          <Input name="username" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false}
            defaultValue={joining ? '' : registered} minLength={3} maxLength={32} pattern="[A-Za-z0-9_]{3,32}"
            aria-describedby="username-help" required disabled={pending} />
        </Field>
        <small id="username-help">영문·숫자·밑줄 3~32자, 대소문자 구분 없음</small>
        <Field>
          비밀번호
          <Input name="password" type="password" autoComplete={joining ? 'new-password' : 'current-password'}
            minLength={joining ? 8 : 1} maxLength={256} required disabled={pending} />
        </Field>
        {joining && (
          <>
            <Field>비밀번호 확인<Input name="confirm" type="password" autoComplete="new-password" minLength={8} maxLength={256} required disabled={pending} /></Field>
            <small>비밀번호는 8자 이상 입력해주세요.</small>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        <Button disabled={pending}>{pending ? '처리 중...' : title}</Button>
      </Form>
      <p><Link to={joining ? '/login' : '/start'}>{joining ? '로그인' : '회사 등록'}</Link></p>
    </Card>
  );
};

export default AuthForm;
