import { useEffect, useState }  from 'react';
import { Link, Route, Routes }  from 'react-router-dom';
import { authMessage, restore } from './api/auth';
import Header                   from './components/header';
import Home                     from './pages/home';
import Login                    from './pages/login';
import Signup                   from './pages/signup';
import Health                   from './pages/health';
import { Page }                 from './app.styles';

const App = () => {
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    restore().catch(error => { if (active) setError(authMessage(error)); });
    return () => { active = false; };
  }, []);

  return (
    <>
      <Header />
      <Page>
        {error && <p role="alert">{error}</p>}
        <Routes>
          <Route path="/"       element={<Home />} />
          <Route path="/login"  element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/health" element={<Health />} />
          <Route path="*" element={<><h1>페이지를 찾을 수 없습니다.</h1><Link to="/">메인으로</Link></>} />
        </Routes>
      </Page>
    </>
  );
};

export default App;
