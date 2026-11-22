import styled          from 'styled-components';
import type { Status } from '../api/health';

type Props = {
  label:  string;
  status: Status;
};

const Row = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 0;
`;

const Value = styled.dd<{ $status: Status }>`
  margin: 0;
  color: ${({ $status }) => $status === 'disabled' ? '#64748b' : $status === 'ok' ? '#166534' : '#b91c1c'};
`;

const StatusRow = ({ label, status }: Props) => (
  <Row>
    <dt>{label}</dt>
    <Value $status={status} data-status={status}>{{ ok: '정상', error: '연결 실패', disabled: '개발 보류' }[status]}</Value>
  </Row>
);

export default StatusRow;
