# DCOMP

거래·문서 관리 시스템.

## 실행

`.env.example`을 복사해 `.env`를 만들고 `JWT_SECRET`(32자 이상), `ADMIN_USERNAME`, `ADMIN_PASSWORD`(12자 이상)를 설정한다.

```sh
docker compose up -d --build --wait
docker compose exec backend npm run seed:admin
```

- 화면: http://localhost
- Health: http://localhost/api/v1/health
- 중지: `docker compose down`

관리자 생성은 최초 1회만 실행한다. 아이디·비밀번호로 로그인하며 회원가입하면 직원 계정으로 바로 로그인된다.
화면은 `/`, `/login`, `/signup`, `/health`, `/partners`, `/items`에 있다.
거래처·품목은 목록, 등록(`/new`), 상세(`/:id`) 화면으로 나뉜다.
인증·거래처·품목 API는 `/api/v1/auth`, `/api/v1/partners`, `/api/v1/items`에 있다.
직원은 거래처 등록·수정과 품목 조회가 가능하다. 품목 변경과 거래처·품목 비활성화는 관리자만 가능하다.
로컬 HTTP는 `COOKIE_SECURE=false`, HTTPS에서는 `true`로 설정한다.

## 구조

- Nginx: 80 포트, React 빌드 파일 서빙, `/api/v1` 프록시
- Frontend: React · TypeScript · styled-components
- Backend: NestJS · TypeORM · MySQL · Redis
- FastAPI: 내부 `/internal/health`

Nginx만 외부에 공개한다. Health는 MySQL·Redis·FastAPI 연결을 확인하며 정상 200, 실패 503을 반환한다.
프론트 컨테이너는 빌드 파일을 복사한 뒤 정상 종료된다.

## DB

빈 MySQL 볼륨으로 처음 실행하면 `mysql/init/01-schema.sql`의 9개 테이블을 생성한다. 재시작 시 기존 DB를 유지한다.

DB·인증·거래처·품목 검증은 별도 임시 MySQL·Redis에서 실행한다.

```sh
docker compose -f compose.test.yml up --build --abort-on-container-exit --exit-code-from test
docker compose -f compose.test.yml down
```

화면 검증은 `frontend`에서 `npx playwright install chromium` 후 `npm run test:browser`로 실행한다. 테스트가 생성한 계정·거래처·품목은 검증 후 삭제한다.
