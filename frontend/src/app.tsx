import { useEffect, useState }  from 'react';
import { health }              from './api/health';
import type { Health, Service } from './api/health';
import { Button }              from './components/ui';
import StatusRow               from './components/status-row';

import { Page, Eyebrow, Title, HealthCard, Heading, ServiceList } from './app.styles';

const services: { key: Service; label: string }[] = [
  { key: 'mysql',   label: 'MySQL' },
  { key: 'redis',   label: 'Redis' },
  { key: 'fastapi', label: 'FastAPI' },
];

const App = () => {
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
    <Page>
      <Eyebrow>Mini ERP · Document Management</Eyebrow>
      <Title>DCOMP</Title>
      <p>거래와 문서를 한곳에서 관리합니다.</p>

      <HealthCard aria-labelledby="health-title">
        <Heading id="health-title">서비스 연결 상태</Heading>
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
      </HealthCard>
    </Page>
  );
};

export default App;
