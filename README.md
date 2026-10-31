# TOUCHLINE

FM 멀티플레이 친구들과 사용하는 PC 호스팅 SNS. 익명 닉네임, 초대 코드로 참여하는 리그, 게시글·댓글·반응, 1:1 DM, FM 화면 자동 수집을 제공합니다.

뉴스 카드는 짧은 기사와 가상 팬 반응을 함께 보여줍니다. 댓글은 팝업 없이 게시글 아래에서 펼치고 작성합니다. 댓글을 접거나 피드가 갱신돼도 현재 페이지의 초안은 유지되며, 브라우저 새로고침 시에는 초기화됩니다.

## 로컬 실행

Node.js 24가 필요합니다. 외부 npm 패키지 설치는 필요 없습니다.

```powershell
Copy-Item .env.example .env
node --env-file-if-exists=.env server/index.js
```

`http://127.0.0.1:3210`에서 계정을 만들고 새 리그를 생성하세요. 데이터는 `data/touchline.db`에 보관합니다. 다른 참가자는 자신의 계정으로 가입한 뒤 리그 초대 코드를 입력합니다. 로그인 ID는 친구에게 공개하지 않지만 서버 운영자는 DB를 열 수 있으며 DM은 종단간 암호화가 아닙니다.

## FM27 자동 수집

FM27은 **외부 Windows OCR 수집 방식**이 기본입니다. 게임 파일을 수정하지 않습니다. FM27의 내부 날짜·메시지 이벤트 브리지는 아직 검증되지 않았습니다. 화면 방식은 새 메시지 도착 외에 메시지 선택이나 스크롤 변화에도 반응할 수 있고, 게임이 가려지거나 최소화되어 있으면 수집하지 않습니다.

1. 리그 운영자 계정에서 **우리 리그 → 자동 수집 설정 → 새 연결 키 만들기**를 선택합니다.
2. 표시된 설정을 `collector/.env`로 저장합니다. 기본 실행 경로는 Steam의 `Football Manager 27/fm.exe`입니다. 다른 드라이브에 설치했다면 `FM_EXECUTABLE`을 수정하세요.
3. FM27을 실행하고 받은편지함을 화면 앞에 둡니다.
4. 별도 터미널에서 실행합니다.

```powershell
node --env-file-if-exists=collector/.env collector/index.js
```

처음 보이는 메시지 화면부터 연속 두 번 같은 내용으로 판독되면 게임 창만 PNG로 캡처해 연결된 리그로 전송합니다. 이후에도 내용이 바뀌고 안정화되면 다시 전송합니다. `CAPTURE_INITIAL=false`로 첫 화면 전송을 끌 수 있습니다. 기본 간격은 3초, 업로드 간격은 최소 15초입니다. 한국어/영어 Windows OCR 언어팩이 필요합니다. 받은편지함 제목을 OCR이 읽지 못하면 수집이 대기할 수 있습니다. 종료는 Ctrl+C입니다. 웹에서 다른 리그로 이동해도 수집기의 연결 대상은 자동으로 바뀌지 않습니다. 새 리그에서 발급한 연결 설정으로 `collector/.env`를 바꾸고 수집기를 재시작하세요.

네트워크 실패 시 미전송 캡처는 `collector/.state/`에 저장하고 재시도합니다. 서버 주소·연결 키·게임 실행 경로·수집 모드별로 큐를 분리합니다. 키 해제 후에는 업로드가 거절됩니다. 수집기 키 및 로컬 큐는 Git에서 제외됩니다. 캡처는 리그 참가자에게 공유되므로 공유하고 싶은 세이브에서만 실행하세요. 같은 PC에서도 게임 수집기는 데스크톱 사용자 세션에서 실행해야 하며 Docker/Actions 서비스 안에서 실행하지 않습니다.

### FM26 기존 브리지

사용자가 제공한 AIFM 1.2.4의 로컬 브리지와 BepInEx FM26 pack을 설치하는 `scripts/Install-FMBridge.ps1`은 **FM26 전용**입니다. DLL이나 AIFM 소스는 이 저장소에 포함하지 않습니다. FM27 폴더에는 이 설치 도구를 사용할 수 없습니다.

FM26 사용 시 `FM_VERSION=26`, 해당 `FM_EXECUTABLE`, `CAPTURE_MODE=bridge`와 `BRIDGE_URL=http://127.0.0.1:47831`을 지정합니다. `/events`의 news/news_body/day_change를 묶고, 받은편지함을 열었을 때 캡처합니다. 최초 연결은 이전 이벤트를 건너뜁니다. `CAPTURE_BACKLOG=true`로 과거 이벤트를 포함할 수 있습니다.

## 기사와 팬 반응

자동 수집 뉴스는 AI가 메시지 본문 또는 포털의 읽을 수 있는 뉴스 제목·요약에서 사실을 추출한 뒤 짧은 기자 기사와 성격이 다른 가상 팬 3~5명의 댓글로 작성합니다. 제목만 보이면 그 제목에서 확인할 수 있는 범위만 사용합니다. 최근 같은 리그의 기사와 팬 발언을 참고해 중복을 줄입니다. 원본 화면은 접힌 참고 자료로만 표시합니다. 읽을 수 있는 축구 소식이 없는 화면·설정 화면이나 이미 작성한 사건은 건너뜁니다. OCR 변화 감지는 판독할 후보를 찾는 용도이며 화면 변화 자체를 뉴스로 게시하지 않습니다.

Windows 호스트에서 로그인한 Codex CLI를 사용하려면 서버 환경에 `NEWS_PROVIDER=codex`를 지정합니다. `CODEX_BIN`으로 실행 파일 경로를 지정할 수 있습니다. 이 설정은 FM 스크린샷과 OCR, 같은 리그의 최근 기사·AI 팬 댓글을 OpenAI로 전송하며 계정 사용 한도를 소비합니다. 키·로그인 쿠키·DM은 생성 자료에 넣지 않습니다. 생성 작업은 임시 폴더와 read-only sandbox에서 실행하고 결과를 검증합니다.

로컬 모델을 쓰려면 `NEWS_PROVIDER=ollama`, `OLLAMA_URL`, `OLLAMA_MODEL`을 설정하세요. 이미지 입력과 JSON 형식을 지원하는 모델이 필요합니다. Docker 이미지에는 Codex CLI나 호스트 로그인이 포함되지 않으므로 Docker 배포에서는 Ollama를 연결하세요. 호스트 자격증명을 컨테이너에 자동 복사하지 않습니다.

AI 미설정 또는 실패 시 원문을 게시하지 않고 수집기 로컬 큐에서 재시도합니다. 기존 원문 게시글도 DB에서 삭제하지 않고 피드에서 제외합니다. 실제 친구 댓글은 익명 프로필로, 가상 팬 반응은 AI 표시로 구분합니다. 팬 기억은 최근 기사 6개/댓글 15개 범위이며 장기 기억이나 자율 잡담 생성은 아직 포함하지 않습니다.

## 내 PC에 GitHub Actions 배포

워크플로는 `.github/workflows/ci.yml`과 `deploy.yml`입니다. CI 성공한 main/master push 또는 수동 실행을 내 PC의 self-hosted runner가 배포합니다.

1. 서버 PC에 Node.js 24, PowerShell 7, Docker Desktop(Linux containers)을 설치합니다.
2. PowerShell 7에서 `./scripts/Initialize-Host.ps1 -DeployRoot C:\Touchline-Server`를 실행합니다. 실행 디렉터리는 runner checkout 밖이어야 합니다.
3. 생성된 `C:\Touchline-Server\.env`를 설정합니다. `SERVER_JOIN_KEY`는 방 생성용 키이며 참가자는 초대 코드만 사용합니다.
4. GitHub 저장소 Settings → Actions → Runners에서 Windows x64 runner를 등록하고 `touchline` 라벨을 추가합니다. Docker에 접근 가능한 사용자로 실행하세요.
5. 저장소 environment `home-server`를 만들고 변수 `DEPLOY_ROOT=C:\Touchline-Server`를 설정합니다.
6. runner 준비 후 저장소 Actions 변수 `DEPLOY_ENABLED=true`를 설정하세요. 이후 main/master push는 CI 후 배포합니다. 이 변수 설정 전에는 배포 작업을 건너뜁니다. 실제 배포 전에 로컬 개발 서버가 3210 포트를 사용하고 있으면 종료하세요.

기본 바인딩은 localhost입니다. 친구들의 외부 접속에는 별도의 HTTPS 리버스 프록시 또는 사설 네트워크 구성이 필요합니다. HTTPS 사용 시 `PUBLIC_ORIGIN=https://실제주소`, `COOKIE_SECURE=true`를 설정하세요. GitHub Actions 자체가 PC 서버의 외부 접속 주소를 제공하지는 않습니다. runner는 신뢰하는 저장소 코드만 실행하도록 관리하세요.

배포는 새 Docker 이미지 빌드 → 기존 서버 종료 → DB 백업 → 새 컨테이너 실행 → 헬스 체크 순서입니다. 실패하면 이전 컨테이너 복구를 시도합니다. DB는 자동으로 덮어쓰지 않으며 `backups/`의 일관된 스냅샷을 보존합니다. 대규모 스키마 변경 시 DB 복구 판단은 별도로 필요합니다.

## 검증

```powershell
node scripts/check.mjs
node --test --test-concurrency=1
```

테스트는 인증, 리그 격리, DM 접근 범위, 게시글·댓글·반응, 수집 키 권한/해제, 중복 이벤트, 이미지 접근, OCR 안정화, FM 버전별 설정/큐 격리를 검증합니다. 실제 FM27 화면 판독과 Docker/Actions 배포는 각 실행 환경에서 별도 확인이 필요합니다.
