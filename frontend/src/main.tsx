import { StrictMode }  from 'react';
import { createRoot }  from 'react-dom/client';
import { GlobalStyle } from './styles/global';
import App             from './app';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GlobalStyle />
    <App />
  </StrictMode>,
);
