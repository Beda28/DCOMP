import { useEffect, useState }  from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { authMessage, restore } from './api/auth';
import Header                   from './components/header';
import ProtectedRoute           from './components/protected-route';
import AdminRoute               from './components/admin-route';
import Users                    from './pages/users';
import Partners                 from './pages/partners';
import Items                    from './pages/items';
import Home                     from './pages/home';
import Login                    from './pages/login';
import Start                    from './pages/start';
import Company                  from './pages/company';
import Health                   from './pages/health';
import Transactions             from './pages/transactions';
import Transaction              from './pages/transaction';
import Documents                from './pages/documents';
import Document                 from './pages/document';
import DocumentUpload           from './pages/document-upload';
import Search                   from './pages/search';
import { Page }                 from './app.styles';

const App = () => {
  const [error, setError] = useState('');
  const { pathname }      = useLocation();

  useEffect(() => {
    let active = true;
    restore().catch(error => { if (active) setError(authMessage(error)); });
    return () => { active = false; };
  }, []);

  return (
    <>
      <Header />
      <Page $wide={['/partners', '/items', '/transactions', '/documents', '/search', '/settings/users'].some(path => pathname.startsWith(path))}>
        {error && <p role="alert">{error}</p>}
        <Routes>
          <Route path="/"       element={<Home />} />
          <Route path="/login"  element={<Login />} />
          <Route path="/start"  element={<Start />} />
          <Route path="/signup" element={<Navigate to="/start" replace />} />
          <Route path="/health" element={<Health />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/settings/company" element={<Company />} />
            <Route element={<AdminRoute />}>
              <Route path="/settings/users"     element={<Users />} />
              <Route path="/settings/users/:id" element={<Users />} />
            </Route>
            <Route path="/partners"     element={<Partners />} />
            <Route path="/partners/:id" element={<Partners />} />
            <Route path="/items"        element={<Items />} />
            <Route path="/items/:id"    element={<Items />} />
            <Route path="/transactions"     element={<Transactions />} />
            <Route path="/transactions/:id" element={<Transaction />} />
            <Route path="/documents"     element={<Documents />} />
            <Route path="/documents/new" element={<DocumentUpload />} />
            <Route path="/documents/:id" element={<Document />} />
            <Route path="/search" element={<Search />} />
          </Route>
          <Route path="*" element={<><h1>페이지를 찾을 수 없습니다.</h1><Link to="/">메인으로</Link></>} />
        </Routes>
      </Page>
    </>
  );
};

export default App;
