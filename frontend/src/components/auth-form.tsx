import { useState, type SubmitEvent }        from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import styled                                from 'styled-components';
import { authMessage, login, signup }        from '../api/auth';
import { useSession }                        from '../api/session';
import { Button, Card, Field, Input, Title } from './ui';

const Form = styled.form`
  display: grid;
  gap: 16px;
  margin-top: 24px;
`;

const AuthForm = ({ mode }: { mode: 'login' | 'signup' }) => {
  const { user, ready }       = useSession();
  const [pending, setPending] = useState(false);
  const [error, setError]     = useState('');
  const navigate             = useNavigate();
  const location             = useLocation();
  const joining              = mode === 'signup';
  const title                = joining ? '회원가입' : '로그인';
  const registered           = typeof location.state?.username === 'string' ? location.state.username : '';
  const notice               = typeof location.state?.message === 'string' ? location.state.message : '';

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
    let created = false;
    try {
      if (joining) {
        await signup(username, password);
        created = true;
      }
      await login(username, password);
      navigate('/', { replace: true });
    }
    catch (error) {
      if (created) {
        navigate('/login', { replace: true, state: {
          username,
          message: `회원가입은 완료되었습니다. 로그인을 다시 시도해주세요. ${authMessage(error)}`,
        } });
      }
      else setError(authMessage(error));
    }
    finally       { setPending(false); }
  };

  if (!ready) return <p role="status">로그인 확인 중...</p>;
  if (user) return <Navigate to="/" replace />;

  return (
    <Card>
      <Title>{title}</Title>
      {!joining && notice && <p role="alert">{notice}</p>}
      <Form onSubmit={submit}>
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
      <p><Link to={joining ? '/login' : '/signup'}>{joining ? '로그인' : '회원가입'}</Link></p>
    </Card>
  );
};

export default AuthForm;
