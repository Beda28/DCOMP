# DCOMP

거래·문서 관리 시스템. 현재는 기본 환경과 health API까지 구현했다.

## 실행

환경 변수는 `.env.example`을 참고해 `.env`에 설정한다.

```sh
docker compose up -d --build --wait
```

- 화면: http://localhost
- Health: http://localhost/api/v1/health
- 중지: `docker compose down`

## 구조

- Nginx: 80 포트, React 빌드 파일 서빙, `/api/v1` 프록시
- Frontend: React · TypeScript · styled-components
- Backend: NestJS · TypeORM · MySQL · Redis
- FastAPI: 내부 `/internal/health`

Nginx만 외부에 공개한다. Health는 MySQL·Redis·FastAPI 연결을 확인하며 정상 200, 실패 503을 반환한다.
프론트 컨테이너는 빌드 파일을 복사한 뒤 정상 종료된다. HTTPS와 업무 기능은 추후 구현한다.
