import { createGlobalStyle } from 'styled-components';

export const GlobalStyle = createGlobalStyle`
  :root {
    font-family: system-ui, sans-serif;
    color: #1e293b;
    background: #f8fafc;
    line-height: 1.6;
    font-synthesis: none;
    word-break: keep-all;
    overflow-wrap: anywhere;
  }

  * { box-sizing: border-box; }
  body { margin: 0; }
`;
