# SwimmingPhotography

수영 대회 사진 판매/관리 서비스. CMS는 설계 중이며, 현재는 `client/public/` 아래에 정적 페이지(`racingcaps` 등)를 폴더 단위로 올려 사용한다.

- **client**: Vue 3 + Vite (개발 서버 포트 `6641`)
- **server**: Express API (포트 `6640`)
- npm **workspaces** 모노레포 (`server`, `client`)

---

## 1. 사전 준비

- **Node.js** `>= 22.18.0` (또는 `>= 24.12.0`)
- **Git**

설치 확인:

```bash
node -v
git --version
```

---

## 2. 프로젝트 받기 (clone)

다른 PC에서 처음 받을 때:

```bash
git clone https://github.com/scmoonkr/SwimmingPhotography
cd SwimmingPhotography
npm install        # 루트에서 한 번 → client/server 의존성 모두 설치됨
```

> `node_modules`는 깃에 올리지 않으므로 clone 후 반드시 `npm install`을 한다.

---

## 3. 실행 방법

루트 디렉터리에서 실행한다.

| 명령 | 설명 |
|------|------|
| `npm run dev` | 서버 + 클라이언트 동시 실행 |
| `npm run server` | 서버만 실행 (http://localhost:6640) |
| `npm run client` | 클라이언트만 실행 (http://localhost:6641) |

접속 주소:

- 클라이언트(Vue 앱): http://localhost:6641
- API 서버 헬스체크: http://localhost:6640/api/health
- 정적 페이지: http://localhost:6641/racingcaps

> 클라이언트의 `/api` 요청은 Vite가 자동으로 서버(`6640`)로 프록시한다.

### 빌드 (배포용)

```bash
npm run build --workspace=client    # client/dist 생성
```

---

## 4. 정적 페이지 추가 (CMS 설계 전 임시 운영)

`client/public/` 안에 **`index.html`이 들어있는 폴더**를 복사하면 짧은 주소로 바로 열린다.

```
client/public/
  racingcaps/        → http://localhost:6641/racingcaps
    index.html
    images/...
  racingcaps1/       → http://localhost:6641/racingcaps1
    index.html
    images/...
```

1. `client/public/`에 폴더를 통째로 복사 (예: `racingcaps2`)
2. 안에 `index.html`과 이미지를 넣기
3. http://localhost:6641/폴더이름 으로 접속

> 별도 설정 없이 동작한다. `client/vite.config.js`의 미들웨어가 확장자 없는 디렉터리 요청을 그 폴더의 `index.html`로 연결해 준다. (Vite 기본 동작은 SPA로 가로채서 Vue 앱을 띄우므로 이 처리가 필요)
>
> 페이지 안에서 이미지를 참조할 때는 상대경로(`./images/foo.jpg`) 또는 폴더 포함 절대경로(`/racingcaps2/images/foo.jpg`)를 사용한다.

---

## 5. Git 사용법

원격 저장소: https://github.com/scmoonkr/SwimmingPhotography (기본 브랜치 `main`)

### 처음 한 번만: 저장소 초기화 (이미 완료됨)

새 폴더를 깃과 처음 연결할 때만 사용한다. 이 프로젝트는 이미 설정되어 있으므로 다시 할 필요 없다.

```bash
git init -b main
git remote add origin https://github.com/scmoonkr/SwimmingPhotography
git add -A
git commit -m "first commit"
git push -u origin main
```

### 평소 작업 흐름 (수정 → 올리기, push)

```bash
git status                 # 바뀐 파일 확인
git add -A                 # 변경분 전부 스테이징
git commit -m "설명 메시지"  # 커밋
git push                   # 원격(main)에 올리기
```

### 최신 내용 받기 (내려받기, pull)

작업 시작 전, 또는 다른 PC에서 올린 변경을 가져올 때:

```bash
git pull
```

> 권장: 작업을 시작하기 전 항상 `git pull`로 최신 상태를 맞춘 뒤 작업한다.

### 자주 쓰는 보조 명령

```bash
git log --oneline -10      # 최근 커밋 10개 보기
git diff                   # 아직 커밋 안 한 변경 내용 보기
git remote -v              # 연결된 원격 주소 확인
```

---

## 6. 커밋에서 제외되는 항목 (`.gitignore`)

```
node_modules/    # 의존성 (clone 후 npm install로 복구)
.env             # 환경변수/비밀값
dist/            # 빌드 결과물
```

> 비밀값(API 키 등)은 `.env`에 두고 절대 커밋하지 않는다.

---

## 7. 디렉터리 구조

```
SwimmingPhotography/
├─ package.json          # 루트(workspaces, 실행 스크립트)
├─ client/               # Vue + Vite 프런트엔드 (포트 6641)
│  ├─ src/               # Vue 앱 소스
│  ├─ public/            # 정적 파일 (racingcaps 등) ← 짧은 주소로 서빙
│  └─ vite.config.js     # dev 서버/프록시/정적폴더 미들웨어 설정
└─ server/               # Express API 서버 (포트 6640)
   └─ src/
      ├─ index.js        # 서버 진입점
      └─ routes/         # events, categories 라우트
```

### API 엔드포인트

| 메서드/경로 | 설명 |
|------------|------|
| `GET /api/health` | 서버 상태 확인 |
| `/api/events` | 이벤트(대회) 관련 |
| `/api/categories` | 카테고리 관련 |
