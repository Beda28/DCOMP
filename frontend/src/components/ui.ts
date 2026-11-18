import styled from 'styled-components';

export const Card = styled.section`
  padding: 24px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
`;

export const Button = styled.button`
  padding: 10px 18px;
  border: 0;
  border-radius: 6px;
  color: #fff;
  background: #1e293b;
  font: inherit;
  cursor: pointer;

  &:disabled { opacity: 0.5; cursor: wait; }
  &:focus-visible { outline: 3px solid #3b82f6; outline-offset: 3px; }
`;
