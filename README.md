# seobkim 기술 문서 사이트

Obsidian의 Markdown 문서를 정적 HTML로 변환해 GitHub Pages에 배포하는 개인 기술 문서 사이트입니다.

## 현재 구성

- 공개 홈페이지와 전체 문서 목록
- 폴더 기반 왼쪽 문서 트리
- 글 상단 목차와 오른쪽 현재 글 목차
- 제목·설명·카테고리·태그 문서 검색
- 이전 글과 다음 글
- 시스템, 라이트, 다크 모드
- C++ 코드 강조와 Consolas 우선 글꼴, 한글 코드용 D2Coding 웹 글꼴
- Obsidian 위키 링크와 이미지 첨부 지원
- 모바일 문서 서랍과 반응형 레이아웃
- 공개 사이트와 분리된 로컬 관리자 화면
- 이력서용 `/seobkim/` 경로
- GitHub Pages 자동 배포 workflow

Cloudflare Web Analytics는 공개 빌드에 포함되며, 통계 조회용 비밀 토큰은 로컬 관리자 서버에서만 사용합니다.

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
- `check:writing`: 수정일 자동 기록, 본문 보존, 날짜 표시와 작성일 정렬 검사
- `check:deployment`: Pin 갱신과 삭제, 배포 소스 검사, 정기 갱신 설정과 Jekyll 제외 범위 검사
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

새 Markdown 파일을 만들면 Vault에 포함된 `Seobkim Writing Tools` 플러그인이 다음 머리말을 즉시 추가합니다.

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

따라서 파일을 만들고 바로 본문을 작성하면 됩니다. 이미 머리말이 있는 문서는 자동 생성값으로 덮어쓰지 않습니다.

### 줄바꿈과 문단

- 일반 본문에서 `Enter` 한 번: 홈페이지에서도 같은 문단 안에서 다음 줄로 넘어갑니다. 줄 끝에 공백 두 칸이나 `<br>`를 추가할 필요가 없습니다.
- `Enter` 두 번으로 빈 줄 삽입: 문단이 나뉘고 문단 사이에 간격이 생깁니다. 빈 줄이 여러 개여도 문단 간격은 같습니다.
- 화면 폭 때문에 자동으로 접힌 줄: 파일에 줄바꿈이 저장된 것은 아닙니다. Obsidian과 홈페이지, 모바일 화면에서 줄 끝 위치가 달라질 수 있습니다.

코드 블록의 줄바꿈과 들여쓰기는 원문 그대로 유지합니다. 표의 줄바꿈은 표의 행으로 처리합니다.

문단과 제목의 간격은 Obsidian과 홈페이지가 공유하는 `content/.obsidian/snippets/seobkim-highlights.css`의 `--seobkim-*` 변수로 관리합니다. 문단 사이는 28px, `##` 앞은 72px, `###` 앞은 64px, `####` 앞은 44px, `#####` 앞은 36px이며 제목과 다음 본문은 12px 간격입니다. Obsidian의 읽기 보기와 라이브 프리뷰에 적용되며, 편집기의 실제 빈 줄은 그대로 유지합니다.

### 작성일과 수정일

- `date`: 문서 생성 시 기록한 작성일입니다. 목차와 최근 글의 정렬은 계속 이 값을 사용합니다.
- `updated`: Obsidian에서 본문을 수정해 저장하면 플러그인이 한국 시간으로 자동 기록합니다. 작성일은 바꾸지 않습니다.
- `draft`, 태그 등 머리말만 바꿀 때와 앱을 다시 열 때는 수정일을 갱신하지 않습니다. 빌드·배포도 수정일을 바꾸지 않습니다.
- 글 제목 바로 아래에 작성일과 수정일을 작은 글씨로 표시합니다. 한국 시간으로 같은 날짜이면 작성일만 표시합니다.

수정일은 문서의 머리말에 저장되므로 다른 PC에서도 그대로 사용합니다. Obsidian을 닫은 상태에서 외부 편집기로 수정한다면 `updated`를 직접 기록할 수 있습니다. 기존 문서의 과거 수정일은 임의로 채우지 않고, 플러그인 적용 후 본문을 수정할 때부터 기록합니다.

    date: "2026-10-01T14:00:00+09:00"
    updated: "2026-10-05T16:30:00+09:00"

플러그인 갱신 후에는 작성 작업을 마친 뒤 Obsidian을 재시작하거나 `Seobkim Writing Tools`를 다시 활성화합니다.

처음 복제한 PC에서 Obsidian이 커뮤니티 플러그인 실행을 차단하면 Vault를 신뢰한 뒤 `설정 → 커뮤니티 플러그인`에서 `Seobkim Writing Tools`를 한 번 활성화합니다. 플러그인이 꺼져 있어도 개발 서버, `build`, `build:preview`, `format:content`는 머리말이 없는 문서를 보정합니다.

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

공개되지 않았거나 저장소에 없는 문서를 위키 링크로 참조하면 공개 화면에서는 표시 이름만 일반 텍스트로 보여줍니다. 빌드 보고서의 `unresolvedLinks`에 안내를 남기며, 이 참조만으로 배포를 중단하지 않습니다. 실제로 깨진 링크·이미지와 다른 빌드 경고는 계속 배포 검사에서 차단합니다.

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

특정 문단으로 연결하려면 대상 문단 끝에 고유한 블록 ID를 붙입니다. 블록 ID는 문서 안에서 중복되지 않게 영문, 숫자, 하이픈으로 작성합니다.

    버퍼의 생성과 해제는 버퍼 매니저가 전담한다. ^buffer-lifetime

다른 문서 또는 같은 문서에서 `#^블록-ID`로 연결합니다.

    [[버퍼 매니저 추가#^buffer-lifetime|버퍼 수명 관리 방식]]
    [[#^buffer-lifetime|위 문단 다시 보기]]

## 강조 색상

Obsidian과 홈페이지가 같은 강조 색상 프리셋을 사용합니다.

Obsidian에서 텍스트를 선택하고 `Ctrl+Shift+H`를 누른 뒤 색상을 선택합니다. 텍스트를 선택하지 않고 실행하면 강조용 자리표시자를 삽입합니다. 명령 팔레트의 `강조:` 명령으로 특정 색상을 바로 적용할 수도 있으며, Obsidian 단축키 설정에서 각 색상에 별도 단축키를 지정할 수 있습니다.

강조를 취소하려면 같은 메뉴에서 `강조 해제`를 선택하거나 명령 팔레트의 `강조: 해제`를 실행합니다. 본문은 선택과 겹치는 강조 구간 전체를 해제하며, 강조된 글 안에 커서만 두고 실행해도 됩니다. 코드 블록은 선택한 줄의 강조만 해제합니다. 선택하지 않고 코드 줄에 커서를 두면 그 한 줄만 해제합니다. 글과 코드 내용, 선택하지 않은 코드 줄의 강조는 그대로 유지됩니다.

    <mark class="hl-yellow">핵심 결정</mark>
    <mark class="hl-red">주의 또는 문제</mark>
    <mark class="hl-green">해결 또는 검증 완료</mark>
    <mark class="hl-blue">개념 또는 정보</mark>
    <mark class="hl-purple">대안 또는 설계</mark>
    <mark class="hl-gray">보충 설명</mark>

색상 원본은 `content/.obsidian/snippets/seobkim-highlights.css` 한 곳에서 관리합니다. Obsidian은 CSS 스니펫으로 읽고, 홈페이지 빌드는 같은 파일을 최종 `site.css`에 포함합니다. 새 프리셋은 이 파일에 색상 변수와 `mark.hl-*` 선택자를 추가합니다.

코드 블록 안에서 줄을 선택한 뒤에도 `Ctrl+Shift+H`를 사용합니다. 선택한 색상과 줄 번호는 코드 내용이 아니라 시작 펜스에 기록되므로 코드를 복사할 때 포함되지 않습니다.

    ```cpp {hl-yellow="2-3" hl-red="6"}
    VkBuffer buffer{};
    CreateBuffer(buffer);
    UploadData(buffer);
    BindBuffer(buffer);
    Draw();
    DestroyBuffer(buffer);
    ```

줄 하나는 `2`, 연속된 줄은 `2-4`, 떨어진 줄은 `2,5,8` 형식으로 기록합니다. 여러 색상을 한 코드 블록에 함께 사용할 수 있습니다. Obsidian의 Live Preview, 소스 보기, 읽기 보기와 홈페이지에서 줄 강조와 줄 번호가 나타납니다. Obsidian과 홈페이지 모두 코드 블록 배경과 줄 강조가 라이트·다크 모드에 맞춰 바뀝니다.

코드 블록 내부에는 `<mark>` 태그를 직접 넣지 않습니다. 시작 펜스의 `hl-*` 속성이나 `Ctrl+Shift+H`로 줄을 강조해야 태그가 코드에 섞이지 않습니다. 플러그인 파일을 갱신한 뒤에는 `Seobkim Writing Tools`를 다시 활성화하거나 Obsidian을 재시작합니다.

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

GitHub Actions는 배포 전에 GitHub의 현재 Pin 목록을 조회합니다. 공개 저장소만 GitHub의 Pin 순서대로 표시하며, Pin에서 제거한 저장소도 함께 제거합니다. 별도의 개인 토큰 등록 없이 Actions가 제공하는 `GITHUB_TOKEN`을 빌드 단계에서만 사용합니다.

Pin 변경은 저장소 Push를 발생시키지 않으므로, 한 시간 간격의 정기 배포도 실행합니다. GitHub 작업 대기 시간에 따라 반영이 지연될 수 있습니다. 바로 갱신하려면 **Actions → Deploy GitHub Pages → Run workflow**를 실행합니다. 로컬 미리보기는 저장소에 저장된 기본 데이터를 사용합니다.

고정 저장소 정보를 갱신할 때 현재 터미널에만 `GITHUB_TOKEN`을 설정한 뒤 실행합니다.

    .\site.cmd sync:pins

토큰은 `.env`나 저장소에 기록하지 않습니다.

## GitHub Pages 설정

저장소 이름은 `SkyLakeARIS.github.io`를 사용합니다. 현재 프로젝트 폴더를 그대로 Git 저장소로 만들면 됩니다.

처음 Push한 뒤 GitHub 저장소의 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 선택합니다. `main` 브랜치에 Push하면 `.github/workflows/deploy.yml`이 공개 빌드와 검사를 수행한 뒤 배포합니다.

배포 소스가 잘못 설정되면 Actions가 빌드 전에 오류로 안내합니다. `_config.yml`은 Jekyll을 실수로 실행했을 때 관리자·문서 원본·개발 소스가 홈페이지 경로로 배포되지 않도록 제외합니다. 정상 배포는 `dist` 산출물만 사용합니다.

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
