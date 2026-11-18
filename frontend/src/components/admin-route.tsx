import { Outlet }      from 'react-router-dom';
import { useSession }  from '../api/session';
import { Card, Title } from './ui';

const AdminRoute = () => {
  const { user } = useSession();
  return user?.role === 'ADMIN' ? <Outlet /> : <Card><Title>접근 권한이 없습니다.</Title><p>관리자만 이용할 수 있습니다.</p></Card>;
};

export default AdminRoute;
