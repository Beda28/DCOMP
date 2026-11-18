import { Link } from 'react-router-dom';
import styled   from 'styled-components';

export const Stack = styled.div`
  display: grid;
  gap: 24px;
  min-width: 0;
`;

export const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
`;

export const Heading = styled(Row)`
  justify-content: space-between;
  gap: 20px;
  p { margin: 8px 0 0; color: #64748b; font-size: 14px; }
`;

export const Breadcrumb = styled.nav`
  display: flex;
  gap: 10px;
  font-size: 13px;
  color: #64748b;
  a { color: #475569; text-decoration: none; }
  a:hover { text-decoration: underline; }
`;

export const Select = styled.select`
  min-height: 42px;
  height: 42px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #fff;
  color: #334155;
  font: inherit;
  &:focus-visible { outline: 2px solid #3b82f6; outline-offset: 2px; }
`;

export const Filters = styled.form<{ $roles: boolean }>`
  display: grid;
  grid-template-columns: ${({ $roles }) => $roles ? 'minmax(0, 1fr) 140px 140px auto' : 'minmax(0, 1fr) 160px auto'};
  align-items: end;
  gap: 16px;
  @media (max-width: 700px) {
    grid-template-columns: ${({ $roles }) => $roles ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr) auto'};
    > label:first-child { grid-column: 1 / -1; }
    > button { grid-column: ${({ $roles }) => $roles ? '1 / -1' : 'auto'}; }
  }
`;

export const Results = styled.section`
  overflow: hidden;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
`;

export const ResultHeader = styled(Row)`
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid #e2e8f0;
  h2 { margin: 0; font-size: 16px; }
  span { font-size: 13px; color: #64748b; }
`;

export const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 14px;
  th, td { text-align: left; padding: 18px 24px; overflow-wrap: anywhere; }
  th { padding-block: 12px; color: #64748b; background: #f8fafc; font-weight: 500; }
  td { border-top: 1px solid #eef2f6; }
  th:first-child { width: 36%; }
  th:last-child { width: 110px; }
  tbody tr:hover { background: #fafcfb; }
  @media (max-width: 600px) {
    th, td { padding: 14px 12px; }
    th:first-child { width: 40%; }
    th:last-child { width: 76px; }
  }
`;

export const EntryLink = styled(Link)`
  color: #235c51;
  font-weight: 600;
  text-decoration: none;
  &:hover { text-decoration: underline; }
  &:focus-visible { outline: 2px solid #3b82f6; outline-offset: 4px; }
`;

export const Badge = styled.span<{ $active: boolean }>`
  display: inline-block;
  padding: 3px 9px;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  color: ${({ $active }) => $active ? '#23634f' : '#64748b'};
  background: ${({ $active }) => $active ? '#eaf5ee' : '#f1f5f9'};
`;

export const Empty = styled.div`
  padding: 64px 24px;
  text-align: center;
  color: #64748b;
  p { margin: 0 0 8px; color: #334155; font-weight: 500; }
  small { display: block; margin-bottom: 20px; }
`;

export const Pagination = styled(Row)`
  justify-content: center;
  padding: 18px 24px;
  border-top: 1px solid #e2e8f0;
  span { min-width: 72px; text-align: center; font-size: 14px; color: #64748b; }
`;

export const Fields = styled.fieldset`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24px;
  border: 0;
  padding: 28px;
  margin: 0;
  min-width: 0;
  @media (max-width: 600px) { grid-template-columns: minmax(0, 1fr); padding: 20px; }
`;

export const SectionTitle = styled.div`
  grid-column: 1 / -1;
  padding-bottom: 16px;
  border-bottom: 1px solid #eef2f6;
  h2 { margin: 0; font-size: 17px; }
  p { margin: 6px 0 0; color: #64748b; font-size: 13px; }
`;

export const Help = styled.small`
  font-size: 12px;
  font-weight: 400;
  color: #64748b;
`;

export const Choices = styled.fieldset`
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
  legend { padding: 0; margin-bottom: 8px; font-size: 14px; font-weight: 500; color: #334155; }
  label { display: flex; align-items: center; gap: 6px; min-height: 42px; font-size: 14px; }
  input { width: 17px; height: 17px; accent-color: #235c51; }
`;

export const Actions = styled(Row)`
  justify-content: space-between;
  padding: 20px 28px;
  border-top: 1px solid #e2e8f0;
  background: #fafcfb;
  @media (max-width: 600px) { padding: 20px; }
`;

export const Message = styled.p<{ $error?: boolean }>`
  margin: 0;
  padding: 14px 18px;
  border: 1px solid ${({ $error }) => $error ? '#fecaca' : '#cce5d7'};
  border-radius: 8px;
  color: ${({ $error }) => $error ? '#991b1b' : '#23634f'};
  background: ${({ $error }) => $error ? '#fff5f5' : '#f0f8f3'};
  font-size: 14px;
`;
