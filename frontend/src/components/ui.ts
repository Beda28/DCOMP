import styled from 'styled-components';

export const Card = styled.section`
  padding: 24px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  min-width: 0;
  @media (max-width: 600px) { padding: 20px; }
`;

export const Button = styled.button<{ $variant?: 'secondary' | 'danger' }>`
  min-height: 42px;
  padding: 10px 18px;
  border: 1px solid ${({ $variant }) => $variant === 'secondary' ? '#cbd5e1' : 'transparent'};
  border-radius: 6px;
  color: ${({ $variant }) => $variant === 'secondary' ? '#334155' : '#fff'};
  background: ${({ $variant }) => $variant === 'secondary' ? '#fff' : $variant === 'danger' ? '#b42318' : '#235c51'};
  font: inherit;
  font-size: 14px;
  line-height: 20px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;

  &:disabled { opacity: 0.5; cursor: wait; }
  &:hover:not(:disabled) { filter: brightness(0.96); }
  &:focus-visible { outline: 3px solid #3b82f6; outline-offset: 3px; }
`;

export const Field = styled.label`
  display: grid;
  gap: 8px;
  min-width: 0;
  color: #334155;
  font-size: 14px;
  font-weight: 500;
`;

export const Input = styled.input`
  width: 100%;
  min-width: 0;
  min-height: 42px;
  height: 42px;
  padding: 10px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font: inherit;
  color: #172b26;
  background: #fff;

  &:focus-visible { outline: 2px solid #3b82f6; outline-offset: 2px; }
  &:disabled { color: #475569; background: #f1f5f9; opacity: 1; }
`;

export const Title = styled.h1`
  margin: 0;
  font-size: 28px;
  letter-spacing: -0.8px;
`;
