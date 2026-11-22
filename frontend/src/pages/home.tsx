import { Link }        from 'react-router-dom';
import { useSession }  from '../api/session';
import { Card, Title } from '../components/ui';
import { Row } from '../components/catalog.styles';

const Home = () => {
  const { user, ready } = useSession();

  return (
    <Card>
      <Title>DCOMP</Title>
      <p>거래와 문서를 한곳에서 관리합니다.</p>
      {ready && (user ? <p>{user.username}님, 환영합니다.</p> : <p><Link to="/login">로그인</Link> 후 이용해주세요.</p>)}
      {user && <Row><Link to="/transactions">거래 관리</Link><Link to="/documents/new">문서 업로드</Link><Link to="/search">문서 검색</Link></Row>}
    </Card>
  );
};

export default Home;
