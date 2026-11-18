import { Navigate, Outlet } from 'react-router-dom';
import { useSession }       from '../api/session';

const ProtectedRoute = () => {
  const { user, ready } = useSession();
  if (!ready) return <p role="status">로그인 확인 중...</p>;
  return user ? <Outlet /> : <Navigate to="/login" replace />;
};

export default ProtectedRoute;
