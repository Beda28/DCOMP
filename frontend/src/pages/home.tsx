import { Link }        from 'react-router-dom';
import { useSession }  from '../api/session';
import { processingEnabled } from '../config';
import { Card, Title } from '../components/ui';
import { Row } from '../components/catalog.styles';

const Home = () => {
  const { user, ready } = useSession();

  return (
    <Card>
      <Title>DCOMP</Title>
      <p>거래처·품목을 등록하고 매입·매출 거래와 증빙 문서를 관리합니다.</p>
      {ready && (user ? <p>{user.username}님, 환영합니다.</p> : <p><Link to="/login">로그인</Link> 후 이용해주세요.</p>)}
      {user && <Row><Link to="/partners">거래처 관리</Link><Link to="/items">품목 관리</Link><Link to="/transactions">거래 관리</Link><Link to="/documents">증빙 문서</Link>{processingEnabled && <Link to="/search">문서 검색</Link>}</Row>}
    </Card>
  );
};

export default Home;
