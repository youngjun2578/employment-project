#!/usr/bin/env python3
"""샘플(가짜) 공고문 PDF·이미지를 생성한다.

HTML 을 만들어 LibreOffice(soffice)로 PDF 변환하고, 이미지는 pdftoppm 으로 PNG 를 뽑는다.
모든 기관명·내용은 명백한 가짜다. 결과물은 public/sample-docs/ 에 저장되며 git 에 커밋한다.

필요: soffice, pdftoppm(poppler-utils), 한글 글꼴(예: fonts-wqy-zenhei 또는 fonts-noto-cjk)
실행: python3 scripts/make-sample-docs.py
"""

import shutil
import subprocess
import sys
import tempfile
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "sample-docs"
FONT = "'Noto Sans CJK KR', 'NanumGothic', 'WenQuanYi Zen Hei', sans-serif"

# (파일명, 기관, 제목, 형식, [(직군, 분야, 인원, 응시자격)], 추가 페이지 수)
DOCS = [
    ("sample-notice-900001", "샘플공사 A", "2026년 하반기 신입사원 공개채용", "pdf", [
        ("사무직", "경영·회계·사무", "12명", "학력·연령 제한 없음 / 공인어학성적 보유자"),
        ("기술직", "전기·전자", "8명", "관련 분야 산업기사 이상 자격 보유자"),
        ("기술직", "정보통신", "5명", "정보처리기사 이상 자격 보유자"),
        ("고졸전형", "경영·회계·사무", "3명", "고등학교 졸업(예정)자"),
    ], 2),
    ("sample-notice-900003", "샘플진흥원 C", "경력직(연구·사업관리) 수시채용", "pdf", [
        ("연구직", "연구", "2명", "관련 분야 박사 학위 또는 석사 후 경력 3년 이상"),
        ("행정직", "사업관리", "1명", "사업관리 실무 경력 5년 이상"),
    ], 0),
    ("sample-notice-900004", "샘플재단 D", "무기계약직(시설관리) 채용", "pdf", [
        ("시설관리", "건설", "2명", "건축설비 관련 자격 보유자 우대"),
        ("환경미화", "경비·청소", "3명", "제한 없음"),
    ], 0),
    ("sample-notice-900007", "샘플공사 E", "청년인턴(채용형) 모집", "pdf", [
        ("사무", "경영·회계·사무", "10명", "만 34세 이하 미취업자"),
        ("전산", "정보통신", "4명", "만 34세 이하 미취업자 / 관련 전공자"),
    ], 1),
    ("sample-notice-900002", "샘플공단 B", "체험형 청년인턴 모집 공고", "png", [
        ("행정", "경영·회계·사무", "15명", "만 34세 이하, 졸업(예정)자"),
        ("현장지원", "사업관리", "5명", "만 34세 이하, 운전면허 소지자 우대"),
    ], 0),
    ("sample-notice-900008", "샘플진흥원 C", "기간제 연구보조원 채용", "png", [
        ("연구보조", "연구", "3명", "관련 분야 학사 이상"),
    ], 0),
]

CSS = f"""
@page {{ size: A4; margin: 18mm 16mm; }}
body {{ font-family: {FONT}; font-size: 10.5pt; color: #111; }}
.mark {{ color: #b91c1c; font-weight: bold; border: 2px solid #b91c1c; padding: 4px 8px; display: inline-block; }}
h1 {{ font-size: 18pt; text-align: center; margin: 14px 0 4px; }}
h2 {{ font-size: 12.5pt; border-bottom: 2px solid #1e3a8a; padding-bottom: 3px; margin-top: 18px; color: #1e3a8a; }}
table {{ border-collapse: collapse; width: 100%; margin-top: 6px; }}
th, td {{ border: 1px solid #555; padding: 5px 6px; font-size: 10pt; }}
th {{ background: #e5e7eb; }}
td.num {{ text-align: center; }}
p.sub {{ text-align: center; color: #444; }}
"""

FILLER = [
    ("전형 절차", "서류전형 → 필기전형(직업기초능력·직무수행능력) → 면접전형 → 신체검사 및 신원조회 → 최종합격"),
    ("우대 사항", "취업지원대상자, 장애인, 이전지역 인재 등은 관련 법령에 따라 가점을 부여합니다. (샘플 문구)"),
    ("유의 사항", "본 문서는 사이트 화면 시험을 위해 만든 가짜 공고문입니다. 실제 채용과 관계가 없습니다."),
]


def html_for(inst, title, rows, extra_pages):
    total = sum(int(r[2].rstrip("명")) for r in rows)
    trs = "".join(
        f"<tr><td>{escape(a)}</td><td>{escape(b)}</td><td class='num'>{escape(c)}</td><td>{escape(d)}</td></tr>"
        for a, b, c, d in rows
    )
    body = [
        "<p><span class='mark'>샘플 데이터 · 실제 공고 아님</span></p>",
        f"<h1>{escape(inst)} {escape(title)}</h1>",
        "<p class='sub'>(가짜 공고문 — 화면 시험용)</p>",
        "<h2>1. 채용 분야 및 인원</h2>",
        "<table border='1' cellspacing='0' cellpadding='5' width='100%'><tr><th width='14%'>직군</th><th width='20%'>채용분야</th><th width='10%'>인원</th><th>응시자격</th></tr>",
        trs,
        f"<tr><th colspan='2'>합계</th><th>{total}명</th><th></th></tr></table>",
        "<h2>2. 공통 응시자격</h2>",
        "<table border='1' cellspacing='0' cellpadding='5' width='100%'><tr><th width='18%'>구분</th><th>내용</th></tr>"
        "<tr><td>연령</td><td>제한 없음 (단, 정년 이내)</td></tr>"
        "<tr><td>병역</td><td>남자의 경우 병역필 또는 면제자</td></tr>"
        "<tr><td>결격사유</td><td>인사규정상 결격사유에 해당하지 않는 자</td></tr></table>",
    ]
    for h, t in FILLER:
        body.append(f"<h2>{escape(h)}</h2><p>{escape(t)}</p>")
    for i in range(extra_pages):
        body.append("<p style='page-break-before: always'></p>")
        body.append(f"<h2>붙임 {i + 1}. 직무기술서 요약 (샘플)</h2>")
        body.append("<table border='1' cellspacing='0' cellpadding='5' width='100%'><tr><th width='22%'>항목</th><th>내용</th></tr>")
        for j in range(14):
            body.append(f"<tr><td>세부 항목 {j + 1}</td><td>가짜 직무 설명 문장입니다. 스크롤 시험용으로 채운 내용입니다.</td></tr>")
        body.append("</table>")
    return f"<html><head><meta charset='utf-8'><style>{CSS}</style></head><body>{''.join(body)}</body></html>"


def run(cmd):
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def main():
    for tool in ("soffice", "pdftoppm"):
        if not shutil.which(tool):
            sys.exit(f"{tool} 가 필요합니다.")
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        for name, inst, title, kind, rows, extra in DOCS:
            src = tmp / f"{name}.html"
            src.write_text(html_for(inst, title, rows, extra), encoding="utf-8")
            run(["soffice", "--headless", "--convert-to", "pdf:writer_web_pdf_Export",
                 "--outdir", str(tmp), str(src)])
            pdf = tmp / f"{name}.pdf"
            if kind == "pdf":
                shutil.copy(pdf, OUT / f"{name}.pdf")
            else:
                run(["pdftoppm", "-png", "-r", "110", "-singlefile", str(pdf), str(tmp / name)])
                shutil.copy(tmp / f"{name}.png", OUT / f"{name}.png")
            print("생성:", (OUT / f"{name}.{kind}").relative_to(ROOT))


if __name__ == "__main__":
    main()
