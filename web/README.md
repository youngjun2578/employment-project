# 공공채용 모아보기 (web)

공공기관·공기업 채용공고 모음 사이트 뼈대. Next.js 16(App Router) + TypeScript.
데이터 소스는 알리오 기반 「재정경제부_공공기관 채용정보 조회서비스」이며, 응답 구조는 `../recruit-probe/FINDINGS.md` 의 가설을 따른다(실호출 전).

## 실행

```bash
cd web
npm install          # postinstall 이 pdf.js 파일을 public/pdfjs/ 로 복사
npm run dev          # http://localhost:3000 (기본: 샘플 데이터 모드)
npm test             # mapper·정렬/필터·수집 파이프라인 테스트
npm run typecheck && npm run lint
```

### 샘플 데이터 켜고 끄기

| `NEXT_PUBLIC_USE_SAMPLE` | 데이터 | 배너 |
|---|---|---|
| 없음 또는 `true` | `data/sample/raw/` 가짜 응답 → 수집 파이프라인 → 메모리 | 상단 "샘플 데이터" 배너 표시, 검색엔진 noindex |
| `false` | `data/postings.json` (수집기 결과, 없으면 0건) | 없음 |

`.env.local` 에 적는다(`.env.example` 참고). `NEXT_PUBLIC_` 값은 **빌드할 때 고정**되므로, 바꾼 뒤에는 `npm run build` 를 다시 하거나 dev 서버를 재시작해야 한다.

## 구조

```
src/lib/
  types.ts             Posting·Attachment·StoredPosting 등 사이트 내부 모델
  mapper.ts            ★ API 응답 → Posting 변환 (응답 구조 지식은 이 파일에만, ⚠️ 목록은 파일 상단)
  dates.ts             YYYYMMDD 파싱, KST 기준 마감 상태(D-day, 마감임박=D-3 이내)
  postingQuery.ts      필터·마감 임박 순 정렬 (저장소 구현체 공용)
  attachments.ts       열람 방식 판별(PDF/이미지/미지원), 첨부 프록시 허용 호스트
  config.ts            샘플 모드 스위치
  repository/          PostingRepository 인터페이스 + JSON 파일 / 메모리 / 샘플 구현체
  source/              RecruitApiClient 인터페이스 + fixture 구현체 + 실제 API 구현체(TODO)
  collector/pipeline.ts 수집 흐름: 호출 → 정규화 → 중복 제거 → 변경·마감 갱신 → 저장
src/app/
  page.tsx                         목록(기관·직무·마감 상태 필터, 마감 임박 순)
  postings/[id]/page.tsx           상세(지원하기, 출처·원문 기준 안내, 요약, 공고문 열람)
  api/attachments/[postingId]/[index]/route.ts  첨부 열람용 같은 출처 엔드포인트
src/components/
  PdfViewer.tsx        pdf.js 렌더링(폭 맞춤, 화면 근처 페이지만, 리사이즈 재렌더)
  NoticeViewer.tsx     PDF / 이미지 / "문서 변환 중" fallback 분기
scripts/
  collect.ts           수집기 CLI (`npx tsx scripts/collect.ts --source fixture|live [--dry-run]`)
  make-sample-docs.py  가짜 공고문 PDF·PNG 생성(LibreOffice, poppler 필요)
  copy-pdfjs.mjs       pdf.js 런타임 파일 복사(postinstall)
data/sample/raw/       가짜 API 응답(목록·상세). 기관명은 "샘플공사 A" 등
public/sample-docs/    가짜 공고문 PDF 4개, PNG 2개
docs/hwp-conversion-check.md  HWP 변환 도구 점검 결과
```

## 수집기

```bash
npx tsx scripts/collect.ts                 # fixture → data/postings.json
npx tsx scripts/collect.ts --dry-run       # 저장 없이 통계만
npx tsx scripts/collect.ts --source live   # 실제 API: 아직 미구현(DataGoKrRecruitClient TODO)
```

- 서비스키는 `DATA_GO_KR_KEY` 환경변수에서만 읽는다. 클라이언트의 private 필드에 두고, 모든 출력은 `redactKey()` 를 거친다.
- `--max-calls`(기본 300)로 개발계정의 일일 1,000건 한도를 보호한다.
- GitHub Actions: `.github/workflows/collect.yml` 은 수동 실행만 된다(스케줄은 주석 처리). 결과는 아티팩트로만 올린다.

## 실제 응답을 받은 뒤 할 일

1. `src/lib/mapper.ts` 상단의 ⚠️ 1~12 를 실제 응답과 대조해서 `FIELD`, `*_KEYS`, `ATTACHMENT_URL_BASE`, `unwrapDetail()` 을 고친다.
2. 실제 응답 몇 건을 `data/sample/raw/` 형식으로 저장해서 `mapper.test.ts` 에 회귀 테스트로 추가한다(키는 지운 상태로).
3. `src/lib/attachments.ts` 의 `ALLOWED_ATTACHMENT_HOSTS` 를 실제 첨부 호스트로 확정한다.
4. `src/lib/source/dataGoKrClient.ts` 의 TODO 를 구현한다. 상세 경로·파라미터명을 확인해야 한다.
