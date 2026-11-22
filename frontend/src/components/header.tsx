import { useState }             from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import styled                   from 'styled-components';
import { authMessage, logout }  from '../api/auth';
import { useSession }           from '../api/session';
import { Button }               from './ui';

const Bar = styled.header`
  border-bottom: 1px solid #e2e8f0;
  background: #fff;
`;

const Navigation = styled.nav`
  width: min(100% - 40px, 1120px);
  margin: 0 auto;
  padding: 14px 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
`;

const Group = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
`;

const MenuLink = styled(NavLink)`
  color: #475569;
  text-decoration: none;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;

  &[aria-current='page'] { color: #235c51; background: #eaf2ef; }
  &:hover { background: #f1f5f4; }
  &:focus-visible { outline: 2px solid #3b82f6; outline-offset: 4px; }
`;

const ErrorMessage = styled.p`
  width: min(100% - 40px, 1120px);
  margin: 0 auto;
  padding-bottom: 16px;
`;

const Header = () => {
  const { user, ready }       = useSession();
  const [pending, setPending] = useState(false);
  const [error, setError]     = useState('');
  const navigate              = useNavigate();

  const signOut = async (): Promise<void> => {
    setPending(true);
    setError('');

    try {
      await logout();
      navigate('/', { replace: true });
    }
    catch (error) { setError(authMessage(error)); }
    finally       { setPending(false); }
  };

  return (
    <Bar>
      <Navigation aria-label="메인 메뉴">
        <Group>
          <MenuLink to="/" end>DCOMP</MenuLink>
          {user && <><MenuLink to="/partners">거래처</MenuLink><MenuLink to="/items">품목</MenuLink></>}
          {user && <MenuLink to="/transactions">거래</MenuLink>}
          {user && <MenuLink to="/settings/company">회사 정보</MenuLink>}
          {user?.role === 'ADMIN' && <MenuLink to="/settings/users">직원 관리</MenuLink>}
          <MenuLink to="/health">헬스체크</MenuLink>
        </Group>
        <Group>
          {!ready ? <span role="status">로그인 확인 중...</span> : user ? (
            <>
              <span>{user.username} · {user.role === 'ADMIN' ? '관리자' : '직원'}</span>
              <Button $variant="secondary" onClick={signOut} disabled={pending}>{pending ? '로그아웃 중...' : '로그아웃'}</Button>
            </>
          ) : (
            <>
              <MenuLink to="/login">로그인</MenuLink>
              <MenuLink to="/start">회사 등록</MenuLink>
            </>
          )}
        </Group>
      </Navigation>
      {error && <ErrorMessage role="alert">{error}</ErrorMessage>}
    </Bar>
  );
};

export default Header;
