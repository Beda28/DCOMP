import { useEffect, useState }  from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { authMessage, restore } from './api/auth';
import Header                   from './components/header';
import ProtectedRoute           from './components/protected-route';
import Partners                 from './pages/partners';
import Items                    from './pages/items';
import Home                     from './pages/home';
import Login                    from './pages/login';
import Signup                   from './pages/signup';
import Health                   from './pages/health';
import { Page }                 from './app.styles';

const App = () => {
  const [error, setError] = useState('');
  const { pathname }     = useLocation();

  useEffect(() => {
    let active = true;
    restore().catch(error => { if (active) setError(authMessage(error)); });
    return () => { active = false; };
  }, []);

  return (
    <>
      <Header />
      <Page $wide={pathname.startsWith('/partners') || pathname.startsWith('/items')}>
        {error && <p role="alert">{error}</p>}
        <Routes>
          <Route path="/"       element={<Home />} />
          <Route path="/login"  element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/health" element={<Health />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/partners" element={<Partners />} />
            <Route path="/partners/:id" element={<Partners />} />
            <Route path="/items" element={<Items />} />
            <Route path="/items/:id" element={<Items />} />
          </Route>
          <Route path="*" element={<><h1>페이지를 찾을 수 없습니다.</h1><Link to="/">메인으로</Link></>} />
        </Routes>
      </Page>
    </>
  );
};

export default App;
