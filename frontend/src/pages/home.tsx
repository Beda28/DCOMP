import { Link }        from 'react-router-dom';
import { useSession }  from '../api/session';
import { Card, Title } from '../components/ui';

const Home = () => {
  const { user, ready } = useSession();

  return (
    <Card>
      <Title>DCOMP</Title>
      <p>거래와 문서를 한곳에서 관리합니다.</p>
      {ready && (user ? <p>{user.username}님, 환영합니다.</p> : <p><Link to="/login">로그인</Link> 후 이용해주세요.</p>)}
    </Card>
  );
};

export default Home;
