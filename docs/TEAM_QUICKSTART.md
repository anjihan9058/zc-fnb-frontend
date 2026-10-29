# 팀원 실행 안내

이 저장소는 ZC FNB의 React·TypeScript·Vite 프론트엔드 소스입니다. GitHub 저장소 업로드와 웹사이트 호스팅은 별개입니다.

## 처음 실행

Node.js와 Git을 설치한 뒤 저장소의 Code 메뉴에서 HTTPS 주소를 복사합니다.

```powershell
git clone <Code 메뉴에서 복사한 HTTPS 주소>
```

복제된 프로젝트 폴더로 이동한 뒤:

```powershell
npm install
npm run dev
```

터미널에 표시된 Local 주소로 접속합니다. 기본 포트는 5173입니다. 이 프로젝트는 `pnpm-lock.yaml`도 제공하므로 pnpm을 사용하는 팀원은 `pnpm install --frozen-lockfile`, `pnpm dev`를 사용할 수 있습니다. 패키지 관리자를 섞어 잠금 파일을 변경하지 않도록 팀에서 하나로 맞추는 것을 권장합니다.

별도 환경변수가 없으면 브라우저 로컬 데모로 시작합니다. `node_modules`와 `dist`는 각 PC에서 생성하며 GitHub에 포함하지 않습니다. 프로젝트 루트의 실제 업로드 사진과 개인 환경변수도 포함하지 않습니다.

## 휴대폰에서 화면 확인

개발 서버가 실행 중인 PC와 휴대폰을 같은 네트워크에 연결하고 `http://PC의IPv4주소:5173`으로 접속합니다. 방화벽과 공유기/핫스팟이 기기 간 연결을 허용해야 합니다. HTTP의 PC IP 주소는 화면 확인용이며 휴대폰 PWA 설치에는 HTTPS 배포가 필요합니다.

## 소스 갱신

자신의 변경 사항을 먼저 커밋하거나 보관한 뒤:

```powershell
git pull
npm install
npm run dev
```

## 빌드 화면을 확인할 때

```powershell
npm run build
npm run preview
```

터미널의 Preview 주소로 접속합니다. 소스를 바꾼 뒤에도 Preview는 이전 `dist`를 사용하므로 다시 빌드해야 합니다.

## 테스트 범위

- 데모 데이터는 각 브라우저·사업장별로 분리되어 저장됩니다. GitHub 소스를 공유해도 채팅 데이터와 업로드 파일이 팀원에게 동기화되지 않습니다.
- 실제 영수증 OCR, 로그인·팀원 공유, 은행·회계 자료 연결은 백엔드 연동이 필요합니다.
- 비공개 저장소는 소유자가 GitHub Settings → Collaborators에서 초대한 팀원만 복제할 수 있습니다.
- 상세 기능과 변경 내역은 README와 docs의 문서를 참고하세요.

이번 저장소 공유 작업에서는 앱의 테스트·타입 검사·빌드를 실행하지 않았습니다.
