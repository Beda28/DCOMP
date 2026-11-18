# DCOMP

거래·문서 관리 시스템.

## 실행

`.env.example`을 복사해 `.env`를 만들고 DB 비밀번호와 `JWT_SECRET`(32자 이상)을 설정한다.

```sh
docker compose up -d --build --wait
```

- 화면: http://localhost
- Health: http://localhost/api/v1/health
- 중지: `docker compose down`

`/start`에서 회사를 등록하면 첫 관리자 계정으로 바로 로그인된다. 이후 회사 코드 6자리·아이디·비밀번호로 로그인한다.
관리자는 `/settings/users`에서 직원을 생성하고 활성 상태·비밀번호를 관리한다. 회사 코드는 `/settings/company`에서 확인한다.
화면은 `/`, `/login`, `/start`, `/health`, `/partners`, `/items`, `/settings/company`, `/settings/users`에 있다.
거래처·품목은 목록, 등록(`/new`), 상세(`/:id`) 화면으로 나뉜다.
API는 `/api/v1` 아래 `auth`, `organizations`, `users`, `partners`, `items`로 나뉜다.
직원은 거래처 등록·수정과 품목 조회가 가능하다. 품목 변경과 거래처·품목 비활성화는 관리자만 가능하다.
계정·거래처·품목은 회사별로 분리된다. 직원 비활성화·비밀번호 초기화 시 해당 계정의 기존 로그인이 모두 해제된다.
로컬 HTTP는 `COOKIE_SECURE=false`, HTTPS에서는 `true`로 설정한다.

## 구조

- Nginx: 80 포트, React 빌드 파일 서빙, `/api/v1` 프록시
- Frontend: React · TypeScript · styled-components
- Backend: NestJS · TypeORM · MySQL · Redis
- FastAPI: 내부 `/internal/health`

Nginx만 외부에 공개한다. Health는 MySQL·Redis·FastAPI 연결을 확인하며 정상 200, 실패 503을 반환한다.
프론트 컨테이너는 빌드 파일을 복사한 뒤 정상 종료된다.

## DB

빈 MySQL 볼륨으로 처음 실행하면 `mysql/init/01-schema.sql`의 10개 테이블을 생성한다. 재시작 시 기존 DB를 유지하며, SQL 수정은 기존 DB에 자동 적용되지 않는다.

DB·인증·회사 격리·직원·거래처·품목 검증은 별도 임시 MySQL·Redis에서 실행한다.

```sh
docker compose -f compose.test.yml up --build --abort-on-container-exit --exit-code-from test
docker compose -f compose.test.yml down
```

화면 검증은 `frontend`에서 `npx playwright install chromium` 후 `npm run test:browser`로 실행한다. 테스트 회사와 그 소속 자료는 검증 후 삭제한다.
별도 환경은 `PLAYWRIGHT_BASE_URL`, `PLAYWRIGHT_COMPOSE_PROJECT`로 지정한다. 로그인 요청 제한에 걸리면 해제 시간을 기다린다.
