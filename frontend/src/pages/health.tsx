import { useEffect, useState }  from 'react';
import styled                   from 'styled-components';
import { health }               from '../api/health';
import type { Health, Service } from '../api/health';
import { Button, Card, Title }  from '../components/ui';
import StatusRow                from '../components/status-row';

const ServiceList = styled.dl`
  margin: 24px 0;
`;

const services: { key: Service; label: string }[] = [
  { key: 'mysql',   label: 'MySQL' },
  { key: 'redis',   label: 'Redis' },
  { key: 'fastapi', label: 'FastAPI' },
];

const HealthPage = () => {
  const [result, setResult]   = useState<Health | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError]     = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    setPending(true);
    setError('');
    setResult(null);

    health(controller.signal)
      .then(data  => { if (!controller.signal.aborted) setResult(data); })
      .catch(()   => { if (!controller.signal.aborted) setError('서버에 연결할 수 없습니다. 잠시 후 다시 확인해주세요.'); })
      .finally(() => { if (!controller.signal.aborted) setPending(false); });

    return () => controller.abort();
  }, [attempt]);

  return (
    <Card aria-labelledby="health-title">
      <Title id="health-title">헬스체크</Title>
      <p role="status" aria-live="polite">
        {pending ? '연결 확인 중...' : error || (result?.status === 'ok' ? '모든 서비스가 정상적으로 연결되었습니다.' : '일부 서비스에 연결할 수 없습니다.')}
      </p>
      {result && (
        <ServiceList>
          {services.map(({ key, label }) => (
            <StatusRow key={key} label={label} status={result.services[key]} />
          ))}
        </ServiceList>
      )}
      <Button disabled={pending} onClick={() => setAttempt(value => value + 1)}>다시 확인</Button>
    </Card>
  );
};

export default HealthPage;
