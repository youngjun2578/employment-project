# 공공기관 채용정보 API 타당성 조사 (1차)

대상: 공공데이터포털 「재정경제부_공공기관 채용정보 조회서비스」 (https://www.data.go.kr/data/15125273/openapi.do, 알리오 기반)

## 0. 이번 조사의 한계 (중요)

- 이 작업 환경의 네트워크 정책이 `apis.data.go.kr`, `www.data.go.kr`, `job.alio.go.kr`, `opendata.alio.go.kr` 접속을 막고 있다(프록시 CONNECT 403).
- 저장소에 `.env.local`(`DATA_GO_KR_KEY`)도 없다.
- 그래서 **실제 API 호출, 응답 원문 저장, 첨부파일 다운로드는 아직 하지 못했다.** 아래 내용은 공개된 2차 자료(공공데이터포털 소개문, 이 API를 실제로 호출하는 공개 GitHub 코드, 그 코드에 옮겨진 코드 정의서)로 확인한 것과, 실호출로 확인해야 할 가설을 구분해서 적었다.
- 실호출에 필요한 스크립트는 `probe.py`로 준비해 두었다(아래 6절).

표기: ✅ 공개 자료로 확인 / ⚠️ 가설(실호출로 확인 필요)

## 1. 엔드포인트

| 구분 | 값 | 상태 |
|---|---|---|
| 목록 | `https://apis.data.go.kr/1051000/recruitment/list` | ✅ (공개 코드 2곳에서 호출, 2026-09-29 이후 200 응답 보고) |
| 상세 | `https://apis.data.go.kr/1051000/recruitment/detail?sn=<recrutPblntSn>` | ⚠️ |
| 형식 | REST, JSON+XML (`resultType=json`) | ✅ |
| 트래픽 | 개발계정 1일 1,000건 | ✅ |
| 인증 | `serviceKey` 쿼리 파라미터. 포털 계정 키는 하나지만 **이 API를 따로 활용신청해야 함**. 미신청 시 HTTP 403 + `SERVICE_KEY_IS_NOT_REGISTERED_ERROR` | ✅ |

## 2. 요청 파라미터 (목록)

| 파라미터 | 의미 | 예시 | 상태 |
|---|---|---|---|
| `serviceKey` | 서비스키(Decoding 키) | — | ✅ |
| `resultType` | 응답 형식 | `json` | ✅ |
| `pageNo` | 페이지 번호 | `1` | ✅ |
| `numOfRows` | 페이지당 건수(최대 100으로 알려짐) | `100` | ✅ |
| `ongoingYn` | 접수 중 공고만 | `Y` | ✅ |
| `pblntInstCd` | 공시기관코드 | `C0021` | ✅ |
| `hireTypeLst` | 고용형태 코드(R1000) | `R1010`(정규직) | ✅ |
| `recrutSe` | 채용구분 코드(R2000) | `R2010`(신입) | ✅ |
| `workRgnLst` | 근무지 코드(R3000) | `R3022`(경남) | ✅ |
| `ncsCdLst` | NCS 직무분야 코드(R6000) | `R600020`(정보통신) | ✅ |
| `acbgCondLst` | 학력 코드(R7000) | `R7050`(대졸 4년) | ✅ |

기관명·제목 키워드 검색 파라미터는 **없다**. 기관명으로 찾으려면 전체를 받아서 걸러야 한다. ✅

## 3. 응답 필드

| 필드명 | 의미 | 예시값 | 상태 |
|---|---|---|---|
| `resultCode` | 결과 코드 | `200` | ✅ |
| `resultMsg` | 결과 메시지 | — | ✅ |
| `totalCount` | 전체 건수 | — | ✅ |
| `result` | 공고 배열 | — | ✅ |
| `recrutPblntSn` | 채용공시 일련번호(상세 조회 키) | — | ✅ |
| `recrutPbancTtl` | 공고 제목 | — | ✅ |
| `instNm` | 기관명 | — | ✅ |
| `pbancBgngYmd` | 공고(접수) 시작일 | `YYYYMMDD` 형식 | ✅ |
| `pbancEndYmd` | 공고(접수) 마감일 | `YYYYMMDD` 형식 | ✅ |
| `workRgnNmLst` | 근무지명 목록 | — | ✅ |
| `srcUrl` | 원문(기관 채용 페이지) URL | — | ✅ 필드 존재 확인. 실제로 채워지는 비율과 가리키는 곳은 ⚠️ |
| `files[].atchType` | 첨부 유형 `A` 공고문 / `B` 입사지원서 / `C` 직무기술서 / `Z` 기타 | `A` | ✅ (코드 정의서 v1.2) |
| `files[].atchFileNm`, `files[].url` 등 | 첨부 파일명·다운로드 URL | — | ⚠️ |
| `pblntInstCd`, `hireTypeNmLst`, `recrutSeNm`, `ncsCdNmLst`, `acbgCondNmLst`, `recrutNope` | 기관코드, 고용형태명, 채용구분명, NCS명, 학력명, 채용인원 | — | ⚠️ |
| `aplyQlfcCn`, `prefCn`, `disqlfcRsn`, `scrnprcdrMthdExpln` | 응시자격, 우대사항, 결격사유, 전형절차 (서술형 텍스트) | — | ⚠️ |
| `nonatchRsn` | 첨부가 없는 이유 | — | ⚠️ |
| `steps[]` | 전형 단계 | — | ⚠️ |

포털 소개문에는 제공 항목이 「제목, 접수기간, 채용직무·인원, 채용 전형 단계, 접수방법 + 첨부파일 메타정보」로 적혀 있다. ✅
⚠️ 표시한 필드명은 사전 지식에 기반한 가설이라, 실호출 결과(`samples/`)로 바로잡아야 한다. 예시값도 실호출 전이라 채우지 않았다.

## 4. 질문별 결론

| 질문 | 현재 결론 |
|---|---|
| 공고문 본문이 응답에 텍스트/HTML로 있나 | **공고문 전체 본문은 없을 가능성이 높다.** 제공 항목은 응시자격·우대·전형 등 **요약 텍스트 필드**와 **첨부파일 메타정보**로 구성된다. 본문은 첨부(`atchType=A` 공고문)에 있다. ⚠️ |
| 첨부파일 정보 | 있다(`files[]`, 공고문/지원서/직무기술서 구분). 파일명·URL 키 이름은 ⚠️ |
| 원문(지원) 링크 | `srcUrl` 필드가 있다. ✅ 다만 기관 채용 사이트로 가는지, 잡알리오 상세로 가는지, 비어 있는 경우가 얼마나 되는지는 ⚠️ |
| 첨부 형식, 로그인 필요 여부 | 미확인. `probe.py download`가 쿠키 없이 받아서 매직바이트로 형식, 리다이렉트, `Content-Disposition`, PDF 텍스트 추출 가능 여부를 기록한다. |
| 이미지 전용 공고 비율 | 미확인. `probe.py analyze`가 「공고문 첨부가 이미지 파일뿐인 공고」 비율을 계산한다. |
| 신협중앙회 | **잡히지 않을 것으로 추정한다.** 알리오는 「공공기관의 운영에 관한 법률」로 지정된 공공기관의 공시 시스템이고, 신협중앙회는 신용협동조합법에 따른 특수법인이라 지정 공공기관 목록에 없는 것으로 알고 있다. ⚠️ `list --all` 전체 스캔 후 `analyze`로 확정한다. |

## 5. 공고문을 사이트 안에서 보여주는 방법 (현재 판단)

1. **API 텍스트 필드로 구조화 요약 화면**을 만든다. 응시자격·우대·전형·인원·기간 등이다. 첨부 없이도 바로 보이고 검색과 필터에도 쓸 수 있다. 근거: 포털 제공 항목 목록.
2. **공고문 첨부(`atchType=A`) 렌더링**
   - PDF: 브라우저 내장 뷰어나 pdf.js로 바로 표시한다. 텍스트 PDF라면 `pdftotext`로 추출해서 HTML로도 보여줄 수 있다.
   - HWP/HWPX: 브라우저에서 그대로는 열리지 않는다. 서버에서 변환(다음 단계 과제)하거나, HWPX(ZIP+XML)는 텍스트를 직접 파싱해야 한다.
   - 이미지: `<img>`로 바로 표시하면 된다. 텍스트 검색이 필요하면 OCR이 필요하다.
3. 「지원하기」 버튼은 `srcUrl`로 연결한다. 비어 있는 공고는 잡알리오 상세 페이지로 대체하는 방안을 검토한다.

어느 방법이 주력이 될지는 첨부 확장자 분포(HWP 비중)와 다운로드 URL이 직접 접근 가능한지에 달려 있다. 이 두 가지가 실호출의 핵심 확인 항목이다.

## 6. 실호출 절차 (호출 예산 약 20건 이내)

```bash
cd recruit-probe
echo 'DATA_GO_KR_KEY=발급받은_Decoding_키' > .env.local   # gitignore 처리됨
python3 probe.py list --pages 10            # 진행중 공고 전체(100건/쪽, 보통 1~6회 호출)
python3 probe.py detail --count 15          # 기관이 다른 15건 상세(15회)
python3 probe.py download --count 2         # 첨부 2건 다운로드(API 호출 아님)
python3 probe.py analyze                    # 호출 없음, samples/ 만 읽음
python3 probe.py list --all --tag all --pages 3   # (선택) 마감 포함 스캔, 신협 확인용
```

- 이미 저장된 페이지/상세는 다시 호출하지 않는다(`--force`로만 재호출).
- 모든 호출은 키를 가린 URL로 `samples/call_log.jsonl`에 남고, 오늘 누적 호출 수가 표시된다.
- 상세 경로·파라미터가 다르면 `--detail-path`, `--detail-param`으로 바꾼다.

## 7. 막히는 부분과 다음 단계

- 막힘 ① **네트워크**: 이 클라우드 환경에서 `apis.data.go.kr`가 막혀 있다. 환경 설정의 Network access에서 `apis.data.go.kr`, `www.data.go.kr`, `job.alio.go.kr`(첨부 다운로드 호스트로 추정)를 허용하거나, 로컬 PC에서 `probe.py`를 실행하면 된다.
- 막힘 ② **서비스키**: `.env.local`이 없다. 15125273 API를 **개별 활용신청**했는지도 확인해야 한다.
- 막힘 ③ **참고문서**: 포털의 요청/응답 명세 문서를 직접 받지 못했다. 코드 정의서 내용은 공개 코드(`MOEF_NKOD_DB_05_코드 정의서_v1.2` 인용)로만 확인했다. 포털에서 「참고문서」를 받아 `recruit-probe/docs/`에 두면 3절 표의 ⚠️를 정리할 수 있다.
- 다음 단계
  1. 실호출 후 `analyze` 결과로 이 문서의 ⚠️ 항목을 확정한다.
  2. HWP 비중이 높으면 변환 방식(서버 변환 vs HWPX 파싱 vs 외부 뷰어)을 비교한다.
  3. 신협중앙회가 없으면 신협 채용 페이지를 별도 수집 소스로 둘지 결정한다.

## 출처

- 공공데이터포털 서비스 페이지: https://www.data.go.kr/data/15125273/openapi.do (검색 결과 요약으로만 확인)
- 목록 엔드포인트·파라미터·필드 매핑: https://github.com/thskal17-sudo/Gyeongnam-Instructor-Announcement (`config/sources.yaml`), 403 사례: 같은 저장소 issue #41
- 필드명·트래픽 한도: https://github.com/nabaho/pureunall/pull/1764
- 파라미터·코드 정의서(첨부유형 포함): https://github.com/iapke486-arch/job-mcp-server (`src/codes.ts`, `src/tools.ts`)
- 오픈API 개방 기사: https://www.kita.net/board/totalTradeNews/totalTradeNewsDetail.do?no=80859&siteId=1
