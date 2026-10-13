#!/usr/bin/env python3
"""공공기관 채용정보 조회서비스(data.go.kr 15125273, 알리오) 타당성 조사 스크립트.

표준 라이브러리만 사용한다. 서비스키는 .env.local 의 DATA_GO_KR_KEY 에서만 읽고,
화면 출력·저장 파일 어디에도 남기지 않는다(모든 URL/에러 문자열에서 마스킹).

하위 명령:
  list      진행중 공고 목록을 받아 samples/list_pageN.json 으로 저장 (API 호출)
  detail    목록 샘플에서 N건을 골라 상세를 받아 samples/detail_<sn>.json 저장 (API 호출)
  download  상세 샘플의 첨부파일 1~2건을 로그인 없이 내려받아 형식 확인 (API 호출 아님)
  analyze   samples/ 만 읽어서 보고용 통계 출력 (호출 없음)

예:
  python3 probe.py list --pages 3
  python3 probe.py detail --count 15
  python3 probe.py download --count 2
  python3 probe.py analyze
"""

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
SAMPLES = HERE / "samples"
ATTACH_DIR = SAMPLES / "attachments"
CALL_LOG = SAMPLES / "call_log.jsonl"

BASE = "https://apis.data.go.kr/1051000/recruitment"
LIST_URL = f"{BASE}/list"
# 상세 오퍼레이션 경로·파라미터명은 공개 자료로 확정하지 못했다. 다르면 --detail-path/--detail-param 으로 바꾼다.
DETAIL_URL = f"{BASE}/detail"

# 코드 정의서(MOEF_NKOD_DB_05_코드 정의서_v1.2) 기준 첨부유형
ATCH_TYPE = {"A": "공고문", "B": "입사지원서", "C": "직무기술서", "Z": "기타"}

IMAGE_EXT = {"jpg", "jpeg", "png", "gif", "bmp", "tif", "tiff", "webp"}


# ---------------------------------------------------------------- 키/보안

def load_key():
    for p in (HERE / ".env.local", HERE.parent / ".env.local"):
        if p.is_file():
            for line in p.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if line.startswith("DATA_GO_KR_KEY="):
                    v = line.split("=", 1)[1].strip().strip('"').strip("'")
                    if v:
                        return v
    sys.exit("DATA_GO_KR_KEY 를 recruit-probe/.env.local 또는 저장소 루트 .env.local 에 넣어 주세요.")


def redact(text, key):
    """키 원문과 URL 인코딩된 형태, serviceKey 쿼리값을 모두 가린다."""
    if not text:
        return text
    s = str(text)
    if key:
        for k in {key, urllib.parse.quote(key, safe=""), urllib.parse.quote_plus(key)}:
            s = s.replace(k, "***")
    return re.sub(r"(serviceKey=)[^&\s\"']+", r"\1***", s, flags=re.I)


# ---------------------------------------------------------------- HTTP

def http_get(url, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": "recruit-probe/0.1"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, dict(r.headers), r.geturl(), r.read()


def api_call(url, params, key):
    """data.go.kr 호출 1건. 응답은 저장하지만 키는 어디에도 남기지 않는다."""
    q = dict(params, serviceKey=key, resultType="json")
    full = url + "?" + urllib.parse.urlencode(q)
    shown = redact(full, key)
    SAMPLES.mkdir(exist_ok=True)
    entry = {"at": datetime.now().isoformat(timespec="seconds"), "url": shown}
    try:
        status, headers, _, body = http_get(full)
    except urllib.error.HTTPError as e:
        status, body = e.code, e.read()
    except Exception as e:  # 네트워크 차단 등
        entry["error"] = redact(repr(e), key)
        _log(entry)
        sys.exit(f"호출 실패: {entry['error']}")
    entry["status"] = status
    _log(entry)
    text = body.decode("utf-8", errors="replace")
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        data = {"_raw_non_json": redact(text, key)[:5000]}
    print(f"[{status}] {shown}")
    return status, data


def _log(entry):
    with CALL_LOG.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def calls_today():
    if not CALL_LOG.exists():
        return 0
    today = datetime.now().date().isoformat()
    return sum(1 for l in CALL_LOG.read_text(encoding="utf-8").splitlines() if l.startswith('{"at": "' + today))


def save(name, data):
    SAMPLES.mkdir(exist_ok=True)
    p = SAMPLES / name
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  -> {p.relative_to(HERE)}")


# ---------------------------------------------------------------- 명령

def cmd_list(a):
    key = load_key()
    print(f"오늘 누적 호출: {calls_today()}건 (개발계정 한도 1,000)")
    for page in range(1, a.pages + 1):
        out = SAMPLES / f"list_{a.tag}_page{page}.json"
        if out.exists() and not a.force:
            print(f"  이미 있음, 건너뜀: {out.name}")
            continue
        params = {"pageNo": page, "numOfRows": a.rows}
        if a.ongoing:
            params["ongoingYn"] = "Y"
        _, data = api_call(LIST_URL, params, key)
        save(out.name, data)
        items = data.get("result") or []
        total = data.get("totalCount")
        print(f"  page {page}: {len(items)}건 / totalCount={total}")
        if not items or (isinstance(total, int) and page * a.rows >= total):
            break


def list_items():
    items = []
    for p in sorted(SAMPLES.glob("list_*_page*.json")):
        items += json.loads(p.read_text(encoding="utf-8")).get("result") or []
    return items


def cmd_detail(a):
    key = load_key()
    items = list_items()
    if not items:
        sys.exit("목록 샘플이 없습니다. 먼저 `probe.py list` 를 실행하세요.")
    # 여러 기관이 섞이도록 기관당 1건씩 고른다
    seen, picked = set(), []
    for it in items:
        if it.get("instNm") in seen:
            continue
        seen.add(it.get("instNm"))
        picked.append(it)
        if len(picked) >= a.count:
            break
    url = f"{BASE}/{a.detail_path}"
    for it in picked:
        sn = it.get("recrutPblntSn")
        out = SAMPLES / f"detail_{sn}.json"
        if out.exists() and not a.force:
            print(f"  이미 있음, 건너뜀: {out.name}")
            continue
        _, data = api_call(url, {a.detail_param: sn}, key)
        save(out.name, data)


def detail_docs():
    docs = []
    for p in sorted(SAMPLES.glob("detail_*.json")):
        d = json.loads(p.read_text(encoding="utf-8"))
        r = d.get("result", d)
        if isinstance(r, list):
            r = r[0] if r else {}
        docs.append((p.name, r))
    return docs


def ext_of(name):
    return name.rsplit(".", 1)[-1].lower() if name and "." in name else ""


def sniff(path):
    head = path.read_bytes()[:8]
    if head.startswith(b"%PDF"):
        return "PDF"
    if head.startswith(b"\xd0\xcf\x11\xe0"):
        return "OLE2(HWP 5.x 또는 구형 MS Office)"
    if head.startswith(b"PK"):
        return "ZIP 계열(HWPX/DOCX/XLSX/ZIP)"
    if head.startswith(b"\x89PNG"):
        return "PNG"
    if head.startswith(b"\xff\xd8"):
        return "JPEG"
    if head[:5].lower() in (b"<!doc", b"<html") or head.startswith(b"<"):
        return "HTML(로그인/오류 페이지일 수 있음)"
    return f"알 수 없음 {head!r}"


def pdf_text_chars(path):
    try:
        out = subprocess.run(["pdftotext", "-layout", str(path), "-"], capture_output=True, timeout=60)
        return len(re.sub(r"\s", "", out.stdout.decode("utf-8", errors="ignore")))
    except Exception:
        return None


def cmd_download(a):
    ATTACH_DIR.mkdir(parents=True, exist_ok=True)
    report = []
    done = 0
    for name, r in detail_docs():
        for f in r.get("files") or []:
            url = f.get("url") or f.get("fileUrl") or f.get("atchFileUrl")
            if not url:
                continue
            fname = f.get("atchFileNm") or f.get("fileNm") or "unknown"
            # 공고문(A) 우선, 서로 다른 확장자 위주로
            if a.only_notice and f.get("atchType") not in (None, "A"):
                continue
            dest = ATTACH_DIR / f"{name[7:-5]}_{f.get('sortNo', done)}.{ext_of(fname) or 'bin'}"
            # 쿠키·Referer 없이 접근 = 로그인 불필요 여부 확인
            rec = {"detail": name, "fileName": fname, "url": url}
            try:
                status, headers, final, body = http_get(url, timeout=60)
                dest.write_bytes(body)
                rec.update(status=status, finalUrl=final, redirected=final != url,
                           contentType=headers.get("Content-Type"),
                           contentDisposition=headers.get("Content-Disposition"),
                           bytes=len(body), sniff=sniff(dest), saved=str(dest.relative_to(HERE)))
                if rec["sniff"] == "PDF":
                    rec["pdfTextChars"] = pdf_text_chars(dest)
            except Exception as e:
                rec["error"] = repr(e)
            report.append(rec)
            print(json.dumps(rec, ensure_ascii=False, indent=2))
            done += 1
            if done >= a.count:
                save("download_report.json", report)
                return
    save("download_report.json", report)


def cmd_analyze(a):
    items = list_items()
    print(f"== 목록 샘플: {len(items)}건")
    if items:
        keys = Counter(k for it in items for k in it)
        print("  필드:", ", ".join(f"{k}" for k, _ in keys.most_common()))
        src = [it.get("srcUrl") for it in items]
        print(f"  srcUrl 채워진 비율: {sum(1 for s in src if s)}/{len(src)}")
        hosts = Counter(urllib.parse.urlparse(s).netloc for s in src if s)
        print("  srcUrl 호스트 상위:", hosts.most_common(10))
        hit = [it for it in items if "신협" in (it.get("instNm") or "") or "신용협동" in (it.get("instNm") or "")]
        print(f"  신협 관련 기관명 공고: {len(hit)}건", [h.get("instNm") for h in hit])
        insts = sorted({it.get("instNm") for it in items})
        print(f"  기관 수: {len(insts)}")

    docs = detail_docs()
    print(f"\n== 상세 샘플: {len(docs)}건")
    ext_counter, type_counter = Counter(), Counter()
    image_only = 0
    for name, r in docs:
        files = r.get("files") or []
        long_text = {k: len(v) for k, v in r.items() if isinstance(v, str) and len(v) >= 100}
        html = [k for k, v in r.items() if isinstance(v, str) and re.search(r"</?(p|br|div|table|span)\b", v, re.I)]
        notice = [f for f in files if f.get("atchType") == "A"]
        notice_ext = {ext_of(f.get("atchFileNm", "")) for f in notice}
        for f in files:
            ext_counter[ext_of(f.get("atchFileNm", ""))] += 1
            type_counter[ATCH_TYPE.get(f.get("atchType"), f.get("atchType"))] += 1
        is_img = bool(notice_ext) and notice_ext <= IMAGE_EXT
        image_only += is_img
        print(f"- {name} | {r.get('instNm')} | {r.get('recrutPbancTtl')}")
        print(f"    srcUrl={r.get('srcUrl')!r}")
        print(f"    100자 이상 텍스트 필드={long_text} HTML태그 포함={html}")
        print(f"    첨부 {len(files)}개, 공고문 확장자={sorted(notice_ext)} 이미지전용={is_img}")
        print(f"    무첨부사유(nonatchRsn)={r.get('nonatchRsn')!r}")
    if docs:
        print("\n  첨부 확장자 분포:", ext_counter.most_common())
        print("  첨부 유형 분포:", type_counter.most_common())
        print(f"  공고문 첨부가 이미지 파일뿐인 공고: {image_only}/{len(docs)}")

    rep = SAMPLES / "download_report.json"
    if rep.exists():
        print("\n== 다운로드 결과")
        for r in json.loads(rep.read_text(encoding="utf-8")):
            print(f"- {r.get('fileName')} status={r.get('status')} 형식={r.get('sniff')} "
                  f"리다이렉트={r.get('redirected')} PDF텍스트글자수={r.get('pdfTextChars')} "
                  f"disposition={r.get('contentDisposition')} err={r.get('error')}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("list")
    p.add_argument("--pages", type=int, default=1)
    p.add_argument("--rows", type=int, default=100)
    p.add_argument("--all", dest="ongoing", action="store_false", help="진행중 필터 끄기(마감 공고 포함)")
    p.add_argument("--tag", default="ongoing", help="저장 파일명 구분자")
    p.add_argument("--force", action="store_true", help="이미 저장된 페이지도 다시 호출")
    p.set_defaults(func=cmd_list)

    p = sub.add_parser("detail")
    p.add_argument("--count", type=int, default=10)
    p.add_argument("--detail-path", default="detail")
    p.add_argument("--detail-param", default="sn")
    p.add_argument("--force", action="store_true")
    p.set_defaults(func=cmd_detail)

    p = sub.add_parser("download")
    p.add_argument("--count", type=int, default=2)
    p.add_argument("--any-type", dest="only_notice", action="store_false", help="공고문(A) 외 첨부도 허용")
    p.set_defaults(func=cmd_download)

    p = sub.add_parser("analyze")
    p.set_defaults(func=cmd_analyze)

    a = ap.parse_args()
    a.func(a)


if __name__ == "__main__":
    main()
