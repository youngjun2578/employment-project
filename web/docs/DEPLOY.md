# 배포 준비 점검 (Vercel, 샘플 모드 프리뷰)

점검일: 2026-10-13. 이 문서는 점검과 문서화만 다룬다. `vercel.json`, 도메인, 실제 배포는 하지 않았다.

## 1. 결론

- **샘플 모드 프리뷰 배포는 지금 설정으로 가능하다.**
  - Root Directory 를 `web` 으로 두고 Framework Preset 을 Next.js 로 두면 된다.
  - 환경변수는 하나도 없어도 된다. 기본값이 샘플 모드다.
- **실데이터 운영 배포 전에는 해결할 것이 있다.**
  - 수집 결과(`data/postings.json`)와 변환된 첨부(`data/attachments/`)가 저장소에도 배포물에도 없다(둘 다 gitignore).
  - 첨부 프록시는 큰 PDF 에서 응답 크기 제한에 걸릴 수 있다(4절).

## 2. Vercel 프로젝트 설정

| 항목 | 값 | 비고 |
|---|---|---|
| Root Directory | `web` | 저장소 루트의 `recruit-probe/`, `.github/` 는 빌드에 쓰지 않는다 |
| Framework Preset | Next.js | 자동 감지 |
| Install Command | 기본(`npm install`) | `postinstall` 이 `public/pdfjs/`(약 4MB)를 만든다. 이 폴더는 gitignore 라서 설치 단계에서 생겨야 한다 |
| Build Command | 기본(`next build`) | Next.js 16.4, Turbopack. 이 환경에서 빌드 성공 확인 |
| Output | 기본 | |
| Node.js | 22.x 권장 | 개발·검증에 Node 22.22 사용. `package.json` 에 `engines` 가 없으니 Vercel 설정에서 고르거나 `engines` 를 추가한다 |
| 함수 리전 | **`icn1`(서울) 권장** | 5절 위험 참고. 설정 파일 또는 프로젝트 설정에서 지정 |

빌드 산출물 점검 결과(`.next/server/**/*.nft.json`):

- 샘플 데이터 `data/sample/raw/**` 는 `next.config.ts` 의 `outputFileTracingIncludes` 덕분에 서버 함수 번들에 포함된다. 그래서 샘플 모드가 서버리스에서도 동작한다.
- `public/sample-docs/`(약 460KB)는 정적 파일로 서빙된다.

## 3. 환경변수 목록

| 변수 | 어디서 | 샘플 프리뷰 | 운영 | 설명 |
|---|---|---|---|---|
| `NEXT_PUBLIC_USE_SAMPLE` | Vercel | 비움 또는 `true` | `false` | 빌드할 때 값이 고정된다. 바꾸면 재배포해야 한다. 샘플 모드면 배너, 전 페이지 noindex, robots 전체 차단, 빈 sitemap |
| `NEXT_PUBLIC_SITE_URL` | Vercel | 선택 | **필수** | canonical, Open Graph, sitemap 절대 주소. 비우면 `http://localhost:3000` 이 들어간다 |
| `SAMPLE_DATASET` | 로컬·프리뷰 | 비움 | 쓰지 않음 | `stress` 면 화면 극단 케이스 검증용 가짜 데이터(샘플 모드에서만, 서버 실행 시 읽음) |
| `NEXT_PUBLIC_NCS_URL` | Vercel | 선택 | 선택 | 기본 `https://ncsmath.com`. utm 파라미터는 코드가 붙인다 |
| `DATA_GO_KR_KEY` | **GitHub Secrets 만** | 불필요 | 수집기만 | **Vercel 에 넣지 않는다.** 사이트는 API 를 직접 부르지 않는다 |
| `DATA_GO_KR_DAILY_LIMIT` | 수집기 | — | 선택 | 일일 호출 상한(기본 300) |
| `DATA_GO_KR_BASE_URL` | 테스트 | — | 쓰지 않음 | 모의 서버 시험 전용 |
| `HWP5ODT_BIN`, `SOFFICE_BIN`, `PDFTOTEXT_BIN`, `PYTHON_BIN` | 수집기 | — | 선택 | 변환 도구 경로. 기본은 PATH 에서 찾는다 |

## 4. 첨부 프록시와 응답 크기 위험

### 현재 구조

| 경로 | 역할 | 데이터 출처 |
|---|---|---|
| `/api/attachments/[postingId]/[index]` | 변환 결과가 없을 때 원본을 받아 그대로 넘기는 프록시. 원본 서버 → Vercel 함수 → 브라우저 | 원본 사이트(허용 호스트만) |
| `/files/[...key]` | 로컬 저장소(`data/attachments/`)의 변환 결과를 읽어 서빙 | 함수의 파일시스템 |

### 위험

1. **응답 크기 제한.**
   - Vercel 함수는 요청 본문 4.5MB 제한이 있다.
   - 응답이 너무 크면 `FUNCTION_RESPONSE_PAYLOAD_TOO_LARGE`(500)가 난다.
   - Vercel 안내는 큰 응답에 스트리밍을 권한다. 두 라우트 모두 스트림으로 응답하지만, 스트리밍 응답의 정확한 상한과 실행 시간 한도는 **플랜별로 다시 확인해야 한다**.
   - 공고문 PDF 는 수 MB~수십 MB(스캔본)까지 나올 수 있다. 코드 상한은 30MB 다.
2. **실행 시간과 비용.** 큰 파일을 프록시하면 함수가 다운로드 시간 내내 살아 있어서 실행 시간·대역폭 비용이 든다. 첨부 요청이 원본 사이트로 그대로 전달되므로 원본에 부담도 준다.
3. **`/files` 는 Vercel 에서 동작하지 않는다.**
   - 함수 파일시스템은 읽기 전용이고 배포마다 새로 만들어진다.
   - `data/attachments/` 는 gitignore 라서 배포물에 없다.
4. **함수 번들 비대.**
   - Turbopack 의 파일 추적이 `/files` 라우트에 `data/attachments/**` 를 포함시킨다(빌드 산출물에서 확인).
   - 빌드 전에 수집·변환을 돌리면 PDF 가 함수 번들에 들어가 번들 크기 제한(압축 해제 기준 250MB)에 가까워질 수 있다.
5. **해외 리전에서 원본 접근이 막힐 수 있다.**
   - 이 작업 환경(해외)에서 `www.data.go.kr`, `apis.data.go.kr` 연결이 원격에서 끊겼다.
   - Vercel 함수가 미국 리전이면 첨부 프록시도 같은 문제를 겪을 수 있다.
   - **GitHub Actions 러너도 해외**라서 수집기가 같은 이유로 실패할 수 있다. 처음 실행할 때 반드시 확인해야 한다.

### 저장소 URL 로 직접 서빙하는 방식으로 바꾸기 위해 필요한 작업

목표: 변환은 수집 단계에서 한 번만 하고, 브라우저는 외부 저장소(예: Vercel Blob, S3+CDN)의 공개 URL 에서 PDF 를 직접 받게 한다. 함수가 파일 바이트를 중계하지 않게 한다.

1. **저장소 구현체 추가.**
   - `src/lib/pipeline/attachments/store.ts` 의 `AttachmentStore` 를 구현하는 `BlobAttachmentStore` 를 만든다.
   - `put()` 은 공개 URL 을 `StoredObject.url` 로 돌려준다.
   - 키에 내용 해시가 있으니 덮어쓰기 없이 업로드하고 캐시를 길게 둔다.
2. **수집기 연결.** `scripts/collect.ts` 에서 저장소를 환경변수(예: `ATTACHMENT_STORE=blob`, 토큰은 GitHub Secrets)로 고른다.
3. **수집 결과 저장 위치 결정.**
   - `data/postings.json` 을 배포물에 넣거나(커밋 또는 빌드 시 아티팩트 다운로드), DB·Blob 의 JSON 으로 옮긴다.
   - DB 를 정하면 `PostingRepository` 구현체를 추가한다.
4. **CORS.**
   - pdf.js 는 `fetch` 로 PDF 를 읽으므로, 저장소 도메인이 사이트 도메인에 `Access-Control-Allow-Origin` 을 허용해야 한다.
   - 또는 커스텀 도메인 아래 같은 출처로 붙인다.
5. **화면.** 이미 `resolveView()` 가 `conversion.viewUrl` 을 우선 쓰므로 바꿀 필요가 없다. 저장소 URL 이 그대로 열람 URL 이 된다.
6. **프록시 역할 축소.**
   - `/api/attachments/...` 는 변환 결과가 없을 때의 임시 경로로만 남긴다.
   - 크기가 상한을 넘으면 원문 링크로 보내도록 바꾼다.
   - 장기적으로는 제거한다.
7. **`/files` 라우트는 로컬 개발 전용으로 표시하고, 운영 빌드에서는 끈다.**
   - 끄는 방법은 예를 들어 `NODE_ENV`·환경변수 확인 후 404 를 내는 것이다.
   - 파일 추적 대상에서 `data/attachments/**` 를 빼서(`outputFileTracingExcludes`) 번들 비대를 막는다.
8. **보존 정책.** 마감 후 일정 기간이 지난 공고의 변환 결과를 지우는 정리 작업을 둔다. 수집기 `retainClosedDays` 와 맞춘다.

## 5. 배포 전 체크리스트

- [ ] Vercel: Root Directory `web`, Node 22, 함수 리전 `icn1`
- [ ] 프리뷰: 환경변수 없이 배포 → 상단 "샘플 데이터" 배너, `/robots.txt` 가 `Disallow: /`, 페이지 `noindex` 확인
- [ ] 운영: `NEXT_PUBLIC_USE_SAMPLE=false`, `NEXT_PUBLIC_SITE_URL` 설정 후 재배포
- [ ] 수집기를 GitHub Actions 에서 수동 실행해 `apis.data.go.kr` 접근 가능 여부 확인(해외 러너 차단 위험)
- [ ] 첨부 저장소(Blob 등)와 수집 결과 저장 위치 결정(4절)
- [ ] `DATA_GO_KR_KEY` 는 GitHub Secrets 에만 있는지 확인(Vercel 환경변수에 없어야 함)

## 참고

- Vercel 함수 제한: https://vercel.com/docs/functions/limitations
- 응답 크기 제한 우회 안내: https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions
- 이 환경에서는 vercel.com 에 직접 접속할 수 없어 검색 결과 요약으로 확인했다. 수치는 배포 전에 공식 문서로 다시 확인할 것.
