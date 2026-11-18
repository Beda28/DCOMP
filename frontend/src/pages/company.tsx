import { useEffect, useState } from 'react';
import { useLocation }         from 'react-router-dom';
import styled                  from 'styled-components';
import { authMessage }         from '../api/auth';
import { getOrganization, type Organization } from '../api/organization';
import { Card, Title }         from '../components/ui';
import { Message, Stack }      from '../components/catalog.styles';

const Details = styled.dl`
  display: grid;
  grid-template-columns: 100px minmax(0, 1fr);
  gap: 24px 16px;
  margin: 28px 0;
  dt { color: #64748b; }
  dd { margin: 0; overflow-wrap: anywhere; }
`;

const Code = styled.span`
  font-family: monospace;
  font-size: 24px;
  letter-spacing: 4px;
  color: #235c51;
`;

const Company = () => {
  const [company, setCompany] = useState<Organization | null>(null);
  const [error, setError]     = useState('');
  const location              = useLocation();

  useEffect(() => {
    const controller = new AbortController();
    getOrganization(controller.signal).then(setCompany).catch(error => {
      if (!controller.signal.aborted) setError(authMessage(error));
    });
    return () => controller.abort();
  }, []);

  return (
    <Stack>
      {location.state?.registered && <Message role="status">회사 등록이 완료되었습니다. 직원에게 회사 코드를 알려주세요.</Message>}
      <Card>
        <Title>회사 정보</Title>
        {error && <Message $error role="alert">{error}</Message>}
        {company ? <>
          <Details>
            <dt>회사명</dt><dd>{company.name}</dd>
            <dt>회사 코드</dt><dd><Code>{company.code}</Code></dd>
            <dt>상태</dt><dd>{company.status === 'ACTIVE' ? '활성' : '비활성'}</dd>
          </Details>
          <p>직원은 관리자가 발급한 아이디·비밀번호와 회사 코드로 로그인합니다.</p>
        </> : !error && <p role="status">불러오는 중...</p>}
      </Card>
    </Stack>
  );
};

export default Company;
