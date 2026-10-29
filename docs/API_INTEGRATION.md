# 프론트엔드 API 연동 계약

이 문서는 구현한 어댑터의 **협의용 계약**입니다. 실제 서버를 검증한 OpenAPI 명세가 아닙니다. 인수인계 문서의 초안을 바탕으로 만들었으며, 아래 확장 사항은 백엔드 담당자와 합의해야 합니다.

2026-10-28 재설계: 신규 영수증에서 형식 지정 필드를 제거했습니다. 응답 정규화·선택적 추가 필드·실제 서버 협의 범위는 [구현 기록](FRONTEND_REDESIGN_IMPLEMENTED.md)을 참고하세요.

## 전환 방법

`.env.example`을 `.env.local`로 복사하고 다음 값을 설정한 뒤 개발 서버를 재시작합니다.

```dotenv
VITE_API_MODE=http
VITE_API_BASE_URL=https://your-backend.example/api/v1
```

`src/shared/api.ts`만 실제 서버 응답에 맞게 조정합니다. 모든 페이지는 `Api` 인터페이스를 통해 동작합니다. 임의 모드 전환 UI를 두지 않아 실서비스와 데모 데이터가 섞이지 않습니다.

HTTP 요청은 `credentials: include`입니다. 별도 도메인이면 서버의 자격증명 CORS, 쿠키 SameSite/Secure 및 CSRF 정책을 함께 확정해야 합니다. 로그인 화면·세션 조회와 사업장 선택 UI는 구현했으며 실제 서버 인증·권한은 별도 연결이 필요합니다. 데모 프로필과 팀명은 가상입니다. 클라이언트 환경변수에 OCR/LLM 비밀키를 넣으면 안 됩니다.

추가된 채팅방·첨부·텍스트 근무표·메뉴 원가·입고·인증 계약은 [CHAT_MENUS_RECEIVING.md](CHAT_MENUS_RECEIVING.md)에 정리했습니다. 실제 백엔드에서 구현 확인된 API가 아니라 프론트 어댑터의 협의용 계약입니다.

## 공통 규칙

- JSON 필드는 `src/shared/types.ts` 참조.
- 목록은 현재 래핑 없는 배열입니다. 서버가 `{items, next_cursor}`로 응답하면 어댑터에서 변환하고 페이지네이션을 연결해야 합니다.
- `image_url`은 서버가 권한을 검사한 서명 URL 또는 `null`입니다. 원본 없는 상태도 렌더링합니다.
- 요청 제한 시간 25초. GET은 TanStack Query에서 1회 재시도하고, 쓰기 요청은 자동 재시도하지 않습니다.
- 영수증 분석 중 2초, 메시지·요약 4초 폴링. SSE/WebSocket은 현재 사용하지 않습니다.
- 승인 POST 이후 GET으로 문서의 `APPROVED` 상태를 재확인해야 성공 처리합니다.
- 수정 성공 후 문서와 관련 쿼리를 무효화합니다. 승인 성공 후 가격·요약 캐시도 무효화합니다.
- 모든 영수증/상품/메시지 권한과 원본 URL 접근권한은 서버가 검증해야 합니다.

## 호출 목록

| 메서드 / 경로 | 요청 | 반환 |
|---|---|---|
| GET `/rooms/{id}/messages` | 없음 | `Message[]` |
| POST `/rooms/{id}/messages` | `{text}` | `Message` |
| POST `/receipts` | multipart `file`, `room_id` (형식 지정 없음) | `{receipt_id,message_id,status,created_at}`; 202 권장 |
| GET `/receipts/{id}` | 없음 | `Receipt` |
| PATCH `/receipts/{id}/items/{item}` | `ItemPatch` + `version` | JSON 또는 204. 이후 GET 재검증 결과 조회 |
| POST `/receipts/{id}/approve` | `{version,idempotency_key}` | JSON 또는 204. 이후 GET 상태 확인 |
| GET `/products/matches` | 없음 | 현재 전체 후보 `Product[]` |
| GET `/price-changes` | 없음 | 현재 확정 구매 행 `Purchase[]` |
| GET `/dashboard/summary` | 없음 | `{processing,review,approved,total,recent:Receipt[]}` |
| GET `/workspaces` | 없음 | `Workspace[]` |
| POST `/workspaces` | `{name,address}` | 생성한 `Workspace` |
| GET `/employees` | 없음 | 해당 사업장 `Employee[]` |
| POST `/employees` | `{name}` | 생성한 `Employee` |
| GET `/work-schedules` | 없음 | 해당 사업장 `WorkSchedule[]` |
| GET `/work-schedules/{id}` | 없음 | `WorkSchedule` |
| PATCH `/work-schedules/{id}` | `{version,shifts}` | JSON 또는 204 |
| POST `/work-schedules/{id}/confirm` | `{version,idempotency_key}` | JSON 또는 204; 이후 GET 확인 |
| POST `/work-schedules/{id}/retry` | 없음 | JSON 또는 204 |
| GET `/shifts` | 없음 | 해당 사업장의 확정 일정 `ConfirmedShift[]` |

일반 API 요청에는 활성 사업장 ID를 `X-Workspace-Id` 헤더로 보냅니다. 사업장 목록·생성 요청에는 보내지 않습니다. 서버는 헤더의 사업장에 대한 사용자 권한을 매 요청마다 확인하고, 접근 거절 시 403을 반환해야 합니다. 브라우저 데모는 사업장별 IndexedDB 키로 자료를 분리합니다. 서버는 사용자의 사업장 권한과 소유 관계를 직접 검증해야 합니다.

### 초안 대비 추가·구체화가 필요한 부분

| 확장 | 현재 구현 | 합의할 내용 |
|---|---|---|
| 문서 정보 수정 | PATCH `/receipts/{id}`, `{document_kind,input_style,purchased_at,supplier,version}` | 분류만 수정하며 자동 OCR 재분석 안 함 |
| 분석 재시도 | POST `/receipts/{id}/retry` | 재처리 작업 생성, 중복·비용 제한 |
| 상품 등록·수정 | POST `/products`, 전체 `Product` | ID 기준 upsert를 가정. 서버가 PUT/PATCH면 어댑터 수정 |
| 사업장/직원 관리 | GET·POST `/workspaces`, GET·POST `/employees`, 활성 `X-Workspace-Id` 헤더 | 실제 서버의 권한 검사, 지점 정책, 이름 중복 범위를 합의 |
| 실제 이상 가격 확인 | `anomaly_confirmed` | 확인 담당자·시각 감사로그, 변경 시 확인 해제 |
| 목록 부가 필드 | `created_at`, `file_name`, `file_type` | 원본 문서 초안에 없는 필드이며 파일 미리보기/정렬에 사용 |
| 가격 조회 | 원시 확정 구매 행, 거래일 `YYYY-MM-DD` | 집계 응답이면 별도 매핑 필요; 구매시각/세금 기준 보강 필요 |
| 일자 없는 문서 | 정보 수정으로 거래일 입력 | 날짜 추정 없이 승인 보류 |
| 폐기 기록 | GET·POST `/waste-records`, PATCH `/waste-records/{id}` (`WasteInput` + `version`), DELETE `/waste-records/{id}` `{version}` → `WasteRecord` (`src/shared/waste.ts`) | 서버 엔드포인트 신규 구현 필요. 추정 손실은 화면에서 폐기일 이전 최근 확정 단가로 계산하며 메뉴 예상 원가율에는 넣지 않음. 손익 연결 시 매출원가 설명 항목으로 사용 |

## 현재 MVP 정책

2026-10-28 변경: 신규 영수증은 유형을 선택하지 않고 파일을 첨부합니다. `upload_mode`, `receipt_format`, `document_type`은 전송하지 않습니다. 문서 유형·작성 방식은 AI 분석 응답에서 받습니다. 과거 문서의 `upload_mode`는 선택적 메타데이터로 조회만 지원합니다. 근무표는 별도 `/work-schedules` API로 처리합니다. 상세 요청·응답과 시간대 규칙은 [근무표 연동 명세](UPLOAD_SCHEDULES.md)를 참조하세요. 추가 필드는 실제 서버와 협의가 필요한 제안입니다.

문서 전체 승인 방식입니다. 모든 행이 검증을 통과하고 거래처와 거래일이 있어야 승인합니다. 단가 없는 검수 명세서는 초안으로 보관되며 구매가격을 만들지 않습니다. 행별 부분 승인과 수량 전용 확정은 서버 정책 확정 후 확장합니다.

영수증 품목 연결에서 포장 규격을 추측하지 않습니다. `kg`와 `망`은 별개이며 실제 원본에 맞는 상품을 연결해야 합니다. 레시피 원가의 g/kg·mL/L 환산은 추가했으며 실서버 계산도 같은 기준을 협의해야 합니다. 이상치 30%는 **데모 검증용 예시**입니다. 실서비스에서는 서버가 반환한 경고와 상태를 사용하며 UI 자체가 판정값을 덮어쓰지 않습니다.

동일 날짜의 가격 이력은 반환 배열 순서상 마지막 구매를 최근 구매로 사용합니다. 직전 비교는 동일 품목·단위 기준이고, 데모 행 재검증은 거래일 이전 기록을 참조합니다. 실제 서버는 구매시각과 비교 범위(거래처별/전체)를 명시해야 합니다. 전날 기록이 없으면 직전값으로 대체하지 않습니다.

문서 전체 합계·부가세·할인·중복 의심·미확인 문자 근거 등 서버 검증이 추가로 필요합니다. 프론트는 경고를 보여주며 승인 API가 최종 권한입니다. `evidence_bbox=null`을 지원하나 좌표 영역 강조는 현재 제공하지 않습니다.

## 오류 응답

```json
{"error":{"code":"AMOUNT_MISMATCH","message":"수량과 단가를 확인해 주세요.","details":{}}}
```

401은 재로그인 안내, 403은 권한 안내, 409는 변경·중복 충돌 안내, 422 등 기타 오류는 서버의 안전한 메시지를 표시합니다. 서버도 업로드 해시 중복 방지, 승인 멱등성, 버전 충돌 검사, 트랜잭션, 감사로그를 구현해야 합니다. 프론트 버튼 비활성화만으로 데이터 안전성을 보장할 수 없습니다.
