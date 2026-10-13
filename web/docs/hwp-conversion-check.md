# HWP 변환 가능성 점검 (보고 전용, 구현 안 함)

점검일: 2026-10-13 / 환경: Ubuntu 24.04.5(이 클라우드 컨테이너), LibreOffice 24.2.7, OpenJDK 21, Python 3.13

## 요약

| 경로 | 설치 | HWP 5.0 변환 결과 (pyhwp 테스트 파일 35개) | 표 | 라이선스 |
|---|---|---|---|---|
| LibreOffice 내장 필터 | 기본 포함(`libhwplo.so`) | **0/3 실패**("source file could not be loaded"). HWP 97 전용이라 HWP 5.0 은 못 연다 | — | MPL-2.0 |
| LibreOffice + **H2Orestart** 0.7.9 확장 → PDF | `.oxt` 다운로드 + `libreoffice-java-common` 필요 | **31/35 성공**. 각주·그림 포함 파일 4개 실패 | 유지 | **GPL-3.0** |
| **pyhwp** 0.1b15 `hwp5odt` → LibreOffice → PDF | `pip install pyhwp six` | **35/35 성공** | 유지(셀 병합·배경색 포함) | **AGPL-3.0+** |
| pyhwp `hwp5txt` (텍스트만) | 위와 같음 | 동작함 | **표 내용이 `<표>` 로 사라짐** | AGPL-3.0+ |
| pyhwp `hwp5html` | 위와 같음 | 동작함(XHTML+CSS) | 구조 유지 | AGPL-3.0+ |

- H2Orestart 실패 파일: `footnote-endnote`, `sample-5017`, `sample-5017-pics`, `shapepict-scaled` (각주, 그림이 들어간 문서)
- 변환 속도: 파일당 약 1.5~2.5초(LibreOffice 기동 포함)
- **HWPX: 미검증.** 샘플 HWPX 를 구하지 못했다. H2Orestart README 는 HWPX 지원을 명시하고, pyhwp 는 HWPX 를 지원하지 않는다.
- **실제 공고문: 미검증.** 시험 파일은 pyhwp 의 단위 테스트용 작은 문서라, 표가 크고 한컴 글꼴을 쓰는 실제 공고문과는 다르다.

## 확인한 문제와 위험

1. **`hwp5txt` 는 공고문에 부적합하다.** 공고문의 핵심인 채용분야·인원·응시자격 표가 `<표>` 한 줄로 바뀐다. 텍스트 추출이 필요하면 `hwp5html` 이나 변환된 PDF 에 `pdftotext` 를 쓰는 편이 낫다.
2. **pyhwp 는 의존성이 깨져 있다.** 최신판(0.1b15, 베타)이 `six` 를 의존성에 적지 않아 설치 직후 `ModuleNotFoundError: six` 가 난다. `pip install six` 로 해결된다. 유지보수가 활발하지 않다.
3. **서식이 깨진다.**
   - pyhwp 경로: 한컴 전용 문자(예: `한글` 로고 문자)가 `□` 로 나온다. 글꼴이 대체되면서 줄바꿈 위치가 원본과 달라진다.
   - H2Orestart 경로: 줄 간격 시험 문서에서 줄이 겹쳐 그려졌다.
   - 원인: 서버에 함초롬체 등 한컴 글꼴이 없음. 글꼴은 재배포 조건을 따로 확인해야 한다.
4. **라이선스**
   - pyhwp(AGPL-3.0): 수정하지 않은 CLI 를 별도 배치 프로세스로 실행하고 결과물(PDF)만 쓰는 방식이 일반적으로 덜 위험하다. 그래도 사이트 코드와 링크하거나 수정해서 네트워크 서비스로 제공하면 소스 공개 의무가 생길 수 있으니 법률 검토가 필요하다.
   - H2Orestart(GPL-3.0): LibreOffice 확장으로 별도 프로세스에서만 쓴다면 사이트 코드에 영향은 작다. 역시 검토가 필요하다.
5. **보안**: 외부에서 받은 문서를 파싱한다. 변환은 웹 서버가 아니라 격리된 배치(CI 러너·컨테이너)에서 시간·메모리 제한을 두고 돌려야 한다. 암호가 걸린 HWP(`password-12345.hwp`)는 시험에서 제외했다.
6. **작업 시 주의**: LibreOffice 는 root 로 사용자 확장을 설치하지 못한다(`unopkg add --shared` 필요). 동시에 여러 개를 실행하면 프로필 잠금이 충돌하므로 `-env:UserInstallation=file:///tmp/...` 로 실행마다 프로필을 분리한다.

## GitHub Actions(ubuntu-latest = 24.04) 적용 판단

같은 방식으로 **가능할 것으로 판단**한다. 다만 러너에서 직접 돌려 보지는 않았다.

```yaml
- run: sudo apt-get update && sudo apt-get install -y libreoffice-writer libreoffice-java-common fonts-noto-cjk
- run: |
    curl -fsSL -o /tmp/H2Orestart.oxt https://github.com/ebandal/H2Orestart/releases/download/v0.7.9/H2Orestart.oxt
    sudo unopkg add --shared /tmp/H2Orestart.oxt
- run: pip install pyhwp six
```

- 러너 이미지에는 LibreOffice 가 기본으로 없어서 apt 설치에 1~3분이 걸린다. 캐시하거나 전용 컨테이너 이미지를 쓰면 줄일 수 있다.
- 확장 다운로드 URL·버전을 고정하고, 체크섬을 검증해야 한다.

## 권장 다음 단계 (구현은 다음 작업)

1. 실제 공고 HWP/HWPX 10~20건을 받아(recruit-probe `download`) 두 경로의 결과를 눈으로 비교한다. 특히 표, 병합 셀, 글꼴을 본다.
2. 1차안은 **pyhwp `hwp5odt` → LibreOffice PDF** 를 주 경로로, **H2Orestart** 를 HWPX·대체 경로로 둔다. 둘 다 실패하면 현재의 "문서 변환 중" fallback 과 원문 링크를 유지한다.
3. 변환은 수집 단계(배치)에서 한 번만 하고, 결과 PDF 를 저장소(예: Blob)에 두고 `Attachment.viewUrl` 로 연결한다. 요청 시점에 변환하지 않는다.
4. `fonts-noto-cjk` 를 설치해서 글꼴 대체 품질을 확인한다. 한컴 글꼴은 라이선스를 확인한 뒤 결정한다.

---

## 추가 점검: 한글 글꼴 설치 전후 비교 (2026-10-13)

### 설치 가능 여부

- `apt-get install fonts-nanum fonts-noto-cjk`: 이 환경(Ubuntu 24.04)에서 **설치 성공**. 나눔고딕·나눔명조 등과 Noto Sans/Serif CJK 가 생겼다.
- GitHub Actions `ubuntu-latest` 에서도 같은 패키지 이름으로 설치할 수 있다(워크플로에 반영).

### 비교 방법

- 대상: `sample-5017.hwp`, `linespacing.hwp`, `table.hwp`
- 경로: pyhwp `hwp5odt` → LibreOffice PDF, 그리고 H2Orestart 직접 변환
- 방법: 아래 세 상태에서 PDF 에 실제로 들어간 글꼴(`pdffonts`)과 렌더링 이미지를 비교했다.
- 원본 HWP 가 요구하는 글꼴: `굴림`, `바탕`, `고딕`, `명조`

| 상태 | pyhwp 경로가 쓴 글꼴 | H2Orestart 경로가 쓴 글꼴 |
|---|---|---|
| 설치 전 | Inter(라틴) + WenQuanYi Zen Hei(중국어 글꼴로 한글 대체) | Inter + WenQuanYi |
| 글꼴만 설치 | (변화 없음) Inter + WenQuanYi | Inter + **Noto Sans CJK SC(중국어판)** |
| 글꼴 설치 + 별칭 설정 `scripts/fontconfig/99-hwp-korean-fonts.conf` | **NanumGothic, NanumMyeongjo** (원본의 고딕/명조 구분 유지) | **NanumMyeongjo** |

- **글꼴만 설치해서는 거의 나아지지 않는다.** fontconfig 가 `굴림`·`바탕`을 모르는 이름으로 보고 기본 라틴 글꼴(Inter)로 보낸 뒤, 한글만 아무 CJK 글꼴로 채우기 때문이다.
- 한컴/윈도 글꼴 이름을 나눔·Noto 로 연결하는 **별칭 설정을 함께 넣어야** 본문이 명조/고딕 구분대로 그려진다. 설정 파일은 이 저장소에 있고, 워크플로가 `/etc/fonts/conf.d/` 로 복사한다.
- 글꼴이 바뀌어도 쪽수는 같았다(sample-5017: 2쪽).

### □ 깨짐

- **원인은 글꼴이 아니었다.** `□` 로 나온 글자는 한컴 전용 **사용자 정의 영역 문자 `U+F53A`**(‘한글’ 로고의 ‘한’)다. 표준 글꼴 어디에도 없어서 어떤 글꼴을 깔아도 해결되지 않는다(설치 전후 모두 □).
- **대응(구현함):** pyhwp 경로에서 ODT → PDF 사이에 `scripts/odt-fix-pua.py` 로 알려진 사용자 정의 영역 문자를 일반 글자로 바꾼다. 치환 후 PDF 텍스트에 "한글 워드 프로세서"가 정상으로 나오는 것을 테스트로 확인했다.
- 실제 공고문에서 다른 사용자 정의 영역 문자가 나오면 `PUA_MAP` 에 추가해야 한다(공고문의 특수 기호·원문자가 후보).
- H2Orestart 경로에는 이 치환이 없다(HWP → PDF 직행).

### 줄 간격

- `linespacing.hwp`(줄 간격 시험용 문서)는 설치 전후 모두 "고정 값 10pt/0pt" 같은 줄이 겹쳐 그려졌다. 글꼴 설치로는 **달라지지 않았다.**
- 이 문서는 일부러 극단적인 고정 줄 간격을 넣은 시험 파일이다. 한컴오피스에서도 겹쳐 보일 수 있어서, 변환 오류인지 원본 그대로인지는 원본 렌더링 없이 판단할 수 없다(**미판정**).
- 실제 공고문으로 다시 봐야 한다.

### 남은 위험

1. 실제 공고 HWP/HWPX 로는 아직 시험하지 못했다. 잡알리오 첨부 호스트 `www.alio.go.kr` 가 이 환경에서 차단돼 있다. HWPX 는 H2Orestart 경로만 있고 샘플이 없어 미검증이다.
2. 나눔 글꼴은 한컴 글꼴과 글자 폭이 달라서 줄바꿈 위치·표 칸 높이가 원본과 다를 수 있다.
3. 별칭 설정은 서버 전역(`/etc/fonts`)을 바꾼다. 변환 전용 러너·컨테이너에서만 쓴다.
