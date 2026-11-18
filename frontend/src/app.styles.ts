import styled from 'styled-components';

export const Page = styled.main<{ $wide: boolean }>`
  width: min(100% - 40px, ${({ $wide }) => $wide ? '1120px' : '640px'});
  margin: 40px auto;
  @media (max-width: 600px) { width: calc(100% - 32px); margin: 24px auto; }
`;
