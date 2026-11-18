import styled   from 'styled-components';
import { Card } from './components/ui';

export const Page = styled.main`
  width: min(100% - 40px, 640px);
  margin: 80px auto;
`;

export const Eyebrow = styled.p`
  color: #64748b;
  font-size: 13px;
`;

export const Title = styled.h1`
  margin: 0;
  font-size: 40px;
  letter-spacing: -1px;
`;

export const HealthCard = styled(Card)`
  margin-top: 32px;
`;

export const Heading = styled.h2`
  margin-top: 0;
  font-size: 20px;
`;

export const ServiceList = styled.dl`
  margin: 24px 0;
`;
