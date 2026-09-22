# seobkim 기술 문서 사이트

Obsidian의 Markdown 문서를 정적 HTML로 변환해 GitHub Pages에 배포하는 개인 기술 문서 사이트입니다.

## 현재 구성

- 공개 홈페이지와 전체 문서 목록
- 폴더 기반 왼쪽 문서 트리
- 글 상단 목차와 오른쪽 현재 글 목차
- 제목·설명·카테고리·태그 문서 검색
- 이전 글과 다음 글
- 시스템, 라이트, 다크 모드
- C++ 코드 강조와 Consolas 우선 글꼴
- Obsidian 위키 링크와 이미지 첨부 지원
- 모바일 문서 서랍과 반응형 레이아웃
- 공개 사이트와 분리된 로컬 관리자 화면
- 이력서용 `/seobkim/` 경로
- GitHub Pages 자동 배포 workflow

Cloudflare Web Analytics는 사이트 검토가 끝난 뒤 마지막 단계에서 추가합니다.

## 새 PC에서 시작

Windows x64와 ARM64를 지원합니다. 시스템에 Node.js나 pnpm을 설치할 필요가 없습니다. 처음 한 번 인터넷 연결이 필요합니다.

저장소를 받은 뒤 프로젝트 폴더에서 실행합니다.

    .\site.cmd setup
    .\site.cmd dev

`site.cmd setup`은 다음 작업을 자동으로 수행합니다.

1. `.node-version`에 고정된 공식 Node.js ZIP을 `nodejs.org`에서 받습니다.
2. 저장소에 기록된 SHA-256으로 파일을 검증합니다.
3. Node.js를 프로젝트의 `.local` 폴더에 설치합니다.
4. `package.json`에 고정된 pnpm 버전을 `.local`에 설치합니다.
5. `pnpm-lock.yaml` 그대로 `.local/pnpm-store`와 `node_modules`를 구성합니다.

`.local`, `node_modules`, `dist`는 언제든 다시 만들 수 있는 로컬 생성물이므로 Git에 커밋하지 않습니다. GitHub Actions도 같은 Node.js·pnpm 버전과 잠금 파일을 사용해 별도로 설치합니다.

처음 이후에는 다음 명령만 사용하면 됩니다.

    .\site.cmd dev

인자를 생략하고 `site.cmd`만 실행해도 개발 서버가 시작됩니다.

브라우저 주소:

- 공개 미리보기: http://127.0.0.1:8000/
- 로컬 관리자: http://127.0.0.1:8000/__admin/
- 이력서 경로: http://127.0.0.1:8000/seobkim/

개발 서버는 현재 컴퓨터의 `127.0.0.1`에만 연결됩니다. 종료할 때 터미널에서 `Ctrl+C`를 누릅니다.

## PC와 노트북에서 이어서 작업

1. 현재 PC에서 SourceTree로 변경 파일을 커밋하고 Push합니다.
2. 노트북에서 저장소를 Clone합니다.
3. 노트북의 저장소 폴더에서 `.\site.cmd setup`을 실행합니다.
4. Obsidian에서 저장소의 `content` 폴더를 Vault로 엽니다.
5. `.\site.cmd dev`로 미리보기를 실행합니다.

로컬 런타임과 라이브러리는 각 컴퓨터에서 자동으로 재현되고, 문서와 설정만 Git으로 공유됩니다.

## 명령

    .\site.cmd setup
    .\site.cmd dev
    .\site.cmd build
    .\site.cmd build:preview
    .\site.cmd check
    .\site.cmd check:repo
    .\site.cmd format:content
    .\site.cmd release:check
    .\site.cmd sync:pins

- `setup`: 로컬 도구와 종속성 준비
- `dev`: 초안을 포함해 감시 빌드하고 로컬 서버 실행
- `build`: 초안을 제외한 공개 사이트 생성
- `build:preview`: 초안을 포함한 일회성 빌드
- `check`: 생성된 사이트의 링크, 공개 범위와 메타데이터 검사
- `check:repo`: 버전 고정, Git 제외 항목, JSON, PC 절대 경로 유출 검사
- `format:content`: 머리말이 없는 모든 Markdown 파일에 기본 머리말 추가
- `release:check`: 저장소 검사, 공개 빌드와 생성 사이트 검사를 순서대로 실행
- `sync:pins`: GitHub 고정 저장소 정보 갱신

## 문서 작성

Obsidian에서 이 프로젝트의 `content` 폴더를 Vault로 엽니다. Obsidian은 Markdown 파일을 실제 `content` 폴더에서 직접 편집합니다.

폴더 구조가 홈페이지 문서 트리가 됩니다.

    content/
    ├─ Projects/
    │  └─ ModelViewer/
    └─ Study/
       └─ DirectX-12/

새 Markdown 파일을 만들면 Vault에 포함된 `Seobkim Frontmatter` 플러그인이 다음 머리말을 즉시 추가합니다.

    content/Study/DirectX-12/05-Descriptor-Heap.md

생성되는 머리말은 다음과 같습니다.

    ---
    title: "Descriptor Heap"
    description: ""
    date: "2026-09-20T14:00:00+09:00"
    draft: false
    tags: []
    ---

자동값은 다음 기준으로 생성됩니다.

- 제목: 파일 이름에서 숫자 순번과 확장자를 제거한 값. 자동 생성된 제목은 파일 이름을 바꾸면 함께 변경
- 목록 순서: 게시 날짜가 최신인 문서부터 표시
- 카테고리와 왼쪽 목차: 폴더 경로
- URL: 폴더와 파일 이름
- 설명: 비워 두면 빌드할 때 본문의 첫 문단 사용
- 읽는 시간: 본문 길이

자동 생성되는 날짜에는 같은 날 작성한 글도 구분할 수 있도록 한국 시간까지 기록됩니다.

따라서 파일을 만들고 바로 본문을 작성하면 됩니다. 이미 머리말이 있는 문서는 변경하지 않습니다.

처음 복제한 PC에서 Obsidian이 커뮤니티 플러그인 실행을 차단하면 Vault를 신뢰한 뒤 `설정 → 커뮤니티 플러그인`에서 `Seobkim Frontmatter`를 한 번 활성화합니다. 플러그인이 꺼져 있어도 개발 서버, `build`, `build:preview`, `format:content`는 머리말이 없는 문서를 보정합니다.

생성된 머리말의 값을 바꾸거나 초안을 표시하려면 직접 수정합니다.

    ---
    title: Descriptor Heap
    description: 직접 지정할 설명
    date: 2026-09-20
    draft: true
    tags:
      - DirectX 12
    slug: descriptor-heap
    ---

`draft: true`인 문서는 개발 화면에는 표시되지만 공개 빌드에서는 제외됩니다. 자동 생성된 문서는 `draft: false`로 시작합니다.

## 이미지

Obsidian 첨부 파일 위치는 Vault의 `_assets`로 공유 설정되어 있습니다. 이미지를 붙여 넣으면 `content/_assets`에 저장됩니다.

Obsidian 기본 문법을 그대로 사용할 수 있습니다.

    ![[command-queue.png]]

캡션을 넣으려면 다음처럼 작성합니다.

    ![[command-queue.png|Command Queue 실행 흐름]]

빌드할 때 이미지는 `dist/assets/media`로 복사되고 본문 경로가 자동 변환됩니다. 이미지 파일 이름은 중복되지 않게 작성합니다.

## 문서 연결

Obsidian 위키 링크를 지원합니다.

    [[02-Command-Queue]]
    [[02-Command-Queue|Command Queue 문서]]
    [[02-Command-Queue#동기화|동기화 부분]]

## 공개 빌드 확인

GitHub에 Push하기 전에 실행합니다.

    .\site.cmd release:check

생성 결과는 `dist`에 저장됩니다. `dist`는 커밋하지 않고 GitHub Actions가 매번 생성합니다.

## 개인 정보와 표시 설정

`src/config/site.mjs`에서 다음 항목을 수정합니다.

- `realName`: 메인 프로필과 푸터에 표시할 이름
- `role`: 메인 프로필에 표시할 직무
- `email`: 연락 이메일
- `linkedinUrl`: LinkedIn 프로필 주소


## GitHub 고정 저장소

기본 데이터는 `src/data/pinned-repos.json`에 있습니다.

고정 저장소 정보를 갱신할 때 현재 터미널에만 `GITHUB_TOKEN`을 설정한 뒤 실행합니다.

    .\site.cmd sync:pins

토큰은 `.env`나 저장소에 기록하지 않습니다.

## GitHub Pages 설정

저장소 이름은 `SkyLakeARIS.github.io`를 사용합니다. 현재 프로젝트 폴더를 그대로 Git 저장소로 만들면 됩니다.

처음 Push한 뒤 GitHub 저장소의 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 선택합니다. `main` 브랜치에 Push하면 `.github/workflows/deploy.yml`이 공개 빌드와 검사를 수행한 뒤 배포합니다.

## 관리자 화면

`admin` 폴더는 개발 서버가 `/__admin/`으로만 제공합니다. 공개 `dist`에는 복사되지 않습니다.

관리자 화면에서 확인할 수 있는 내용:

- 공개 문서 수
- 초안 수
- 전체 문서 수
- 마지막 로컬 빌드 시각
- 최근 문서와 원본 Markdown 경로
- 빌드 경고와 공개 준비 상태
- Git 변경 파일 또는 저장소 생성 전 상태
- Obsidian 첨부 이미지 목록과 파일 크기
- Cloudflare Web Analytics의 기간별 전체 조회수와 페이지 경로별 조회수

## 방문 통계

관리자 화면에는 Cloudflare Web Analytics의 페이지별 조회수 표시 기능이 준비되어 있습니다. 공개 사이트에 통계 수집용 Beacon을 연결하기 전에는 `OFF`로 표시됩니다.

사이트 배포 후 Cloudflare에서 Web Analytics 사이트를 생성하고, 프로젝트 루트에 Git에서 제외되는 `.env.local` 파일을 만듭니다.

    CLOUDFLARE_ACCOUNT_ID=Cloudflare 계정 ID
    CLOUDFLARE_SITE_TAG=Web Analytics Site Tag
    CLOUDFLARE_API_TOKEN=읽기 전용 API 토큰
    CLOUDFLARE_ANALYTICS_HOST=skylakearis.github.io

API 토큰에는 **Account → Account Analytics → Read**와 **Account → Account Settings → Read** 권한만 부여합니다. Site Tag는 등록된 hostname을 기준으로 자동 조회합니다. `.env.local`은 `.gitignore`에 포함되어 있으므로 커밋되지 않습니다. 값을 변경한 뒤 `site.cmd dev`를 다시 실행하면 관리자 화면에서 최근 7일, 30일, 90일 통계를 확인할 수 있습니다.

관리자 API는 토큰을 로컬 Node.js 프로세스에서만 사용합니다. 브라우저 응답과 공개 `dist`에는 계정 ID, Site Tag와 API 토큰이 포함되지 않습니다. 실제 방문 수집을 시작하는 Beacon 코드는 Cloudflare 사이트 생성 후 마지막 연결 단계에서 공통 페이지 양식에 추가합니다.

## 초기화 문제 해결

첫 실행에는 다음 주소에 접근할 수 있어야 합니다.

- `https://nodejs.org`
- `https://registry.npmjs.org`

로컬 도구가 손상된 경우 `.local` 폴더만 삭제하고 다시 실행합니다.

    .\site.cmd setup

문서, 사이트 소스와 Git 기록에는 영향을 주지 않습니다.