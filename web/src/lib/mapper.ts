/**
 * 알리오 「재정경제부_공공기관 채용정보 조회서비스」 응답 → 사이트 내부 Posting 변환.
 *
 * API 응답 구조에 대한 지식은 이 파일에만 둔다. 응답 구조가 바뀌면 이 파일만 고친다.
 * 근거: recruit-probe/FINDINGS.md 3절 필드 표 (✅ 공개 자료로 확인 / ⚠️ 가설)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ 실제 응답 확인 후 검증 필요
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. FIELD.institutionCode  `pblntInstCd` 가 상세/목록 응답 필드로도 오는지
 *                            (요청 파라미터로는 ✅). 없으면 중복 제거 키가 기관명으로 떨어진다.
 *  2. FIELD.regions/jobFields/hireTypes  `*NmLst` 값이 배열인지, 쉼표 구분 문자열인지
 *                            → splitList() 가 둘 다 처리하지만 구분자를 확인할 것.
 *  3. FIELD.recruitType      `recrutSeNm` 필드명.
 *  4. FIELD.headcount        `recrutNope` 필드명과 숫자/문자열 여부("00명" 같은 표기 포함).
 *  5. FIELD.qualification / preference / disqualification
 *                            `aplyQlfcCn` / `prefCn` / `disqlfcRsn` 필드명,
 *                            HTML 태그·엔티티(&lt; 등) 포함 여부 → cleanText() 정책 확인.
 *  6. FIELD.stepsText / FIELD.steps
 *                            전형절차가 서술 텍스트(`scrnprcdrMthdExpln`)인지, 배열(`steps[]`)인지,
 *                            배열이면 단계명 키(STEP_NAME_KEYS)가 무엇인지.
 *  7. FIELD.files + FILE_*_KEYS
 *                            첨부 배열 키(`files`), 파일명(`atchFileNm`), URL(`url`), 정렬(`sortNo`) 키.
 *                            `atchType` 코드(A/B/C/Z)는 코드 정의서로 ✅.
 *  8. 첨부 URL 이 절대경로인지 상대경로인지 → ATTACHMENT_URL_BASE.
 *  9. FIELD.noAttachmentReason `nonatchRsn` 필드명.
 * 10. srcUrl 이 기관 채용 페이지인지, 잡알리오 상세인지, 빈 값이 얼마나 흔한지 (필드 존재는 ✅).
 *     현재는 http(s) 절대 URL 이면서 호스트가 정상 도메인/IP 인 것만 인정한다.
 *     (잡알리오 화면 관찰: "공고 URL" 칸에 기관 채용 사이트 주소가 오며, "http://," 처럼 깨진 값도 있었다
 *      → web/docs/alio-observation.md)
 * 11. 상세 응답의 감싸는 구조: `result` 가 객체인지 배열(1건)인지 → unwrapDetail().
 * 12. 날짜 필드에 시각이 붙어 오는지(YYYYMMDDhhmm 등). parseYmd() 는 앞 8자리만 쓴다.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { parseYmd } from "./dates";
import type { Attachment, AttachmentType, Posting } from "./types";

/** 외부 응답 1건(목록 item 또는 상세 result). 구조를 믿지 않고 unknown 으로 다룬다. */
export type RawRecord = Record<string, unknown>;

/**
 * 내부 필드 ← API 필드 후보. 배열 앞쪽부터 처음으로 값이 있는 키를 쓴다.
 * ✅ 표시가 없는 항목은 모두 가설이다.
 */
export const FIELD = {
  sn: ["recrutPblntSn"], // ✅
  title: ["recrutPbancTtl"], // ✅
  institutionName: ["instNm"], // ✅
  institutionCode: ["pblntInstCd"], // ⚠️ 1
  startDate: ["pbancBgngYmd"], // ✅
  endDate: ["pbancEndYmd"], // ✅
  regions: ["workRgnNmLst"], // ✅ (값 형식은 ⚠️ 2)
  jobFields: ["ncsCdNmLst"], // ⚠️ 2
  hireTypes: ["hireTypeNmLst"], // ⚠️ 2
  recruitType: ["recrutSeNm"], // ⚠️ 3
  headcount: ["recrutNope"], // ⚠️ 4
  qualification: ["aplyQlfcCn"], // ⚠️ 5
  preference: ["prefCn", "prefCondCn"], // ⚠️ 5
  disqualification: ["disqlfcRsn"], // ⚠️ 5
  stepsText: ["scrnprcdrMthdExpln"], // ⚠️ 6
  steps: ["steps"], // ⚠️ 6
  srcUrl: ["srcUrl"], // ✅ (값 의미는 ⚠️ 10)
  files: ["files"], // ⚠️ 7
  noAttachmentReason: ["nonatchRsn"], // ⚠️ 9
} as const;

const STEP_NAME_KEYS = ["recrutPbancStepNm", "stepNm", "name"]; // ⚠️ 6
const FILE_NAME_KEYS = ["atchFileNm", "fileNm"]; // ⚠️ 7
const FILE_URL_KEYS = ["url", "atchFileUrl", "fileUrl"]; // ⚠️ 7
const FILE_TYPE_KEYS = ["atchType"]; // ✅ (코드 정의서)
const FILE_SORT_KEYS = ["sortNo"]; // ⚠️ 7
/**
 * 첨부 URL 이 상대경로로 올 때 붙일 기준 주소. ⚠️ 8
 * 잡알리오 화면에서는 첨부가 https://www.alio.go.kr/download/download.json?fileNo=N 절대 URL 이었다.
 */
const ATTACHMENT_URL_BASE = "https://www.alio.go.kr";
/** 샘플 데이터 전용 사이트 내부 경로 */
const LOCAL_SAMPLE_PREFIX = "/sample-docs/";

// ───────────────────────────── 방어적 읽기 도우미 ─────────────────────────────

function pick(raw: RawRecord | null | undefined, keys: readonly string[]): unknown {
  if (!raw || typeof raw !== "object") return undefined;
  for (const k of keys) {
    const v = raw[k];
    if (v === null || v === undefined) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    return v;
  }
  return undefined;
}

function asString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

const ENTITIES: Record<string, string> = {
  "&lt;": "<",
  "&gt;": ">",
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

/** 서술형 텍스트 정리: HTML 태그 제거(줄바꿈 보존), 엔티티 복원, 공백 정리. ⚠️ 5 */
export function cleanText(v: unknown): string | null {
  const s = asString(v);
  if (!s) return null;
  const text = s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(lt|gt|amp|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text || null;
}

/** 배열 또는 "a,b|c" 형태 문자열 → 중복 없는 문자열 배열. ⚠️ 2 */
export function splitList(v: unknown): string[] {
  const parts: string[] = [];
  if (Array.isArray(v)) {
    for (const x of v) {
      const s = asString(typeof x === "object" && x ? pick(x as RawRecord, ["nm", "name"]) : x);
      if (s) parts.push(s);
    }
  } else {
    const s = asString(v);
    if (s) parts.push(...s.split(/[,|/·]/));
  }
  return [...new Set(parts.map((p) => p.trim()).filter(Boolean))];
}

/** 12, "12", "12명", "0명", "00명" → 숫자 / 해석 불가면 null. ⚠️ 4 */
export function parseHeadcount(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? Math.floor(v) : null;
  const s = asString(v);
  if (!s) return null;
  const m = s.replace(/,/g, "").match(/\d+/);
  return m ? Number(m[0]) : null;
}

/** 점으로 구분된 도메인 이름 또는 IPv4 인지 (WHATWG URL 은 "http://," 같은 값도 받아들인다) */
const HOSTNAME_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59}|\d{1,3})$/i;

/** http(s) 절대 URL 만 인정. 그 외(빈 값, "#", javascript:, 깨진 호스트 등)는 null. ⚠️ 10 */
export function normalizeUrl(v: unknown, base?: string): string | null {
  const s = asString(v);
  if (!s) return null;
  try {
    const u = base ? new URL(s, base) : new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return HOSTNAME_RE.test(u.hostname) ? u.toString() : null;
  } catch {
    return null;
  }
}

export function extensionOf(fileName: string): string {
  const m = fileName.match(/\.([A-Za-z0-9]{1,5})$/);
  return m ? m[1].toLowerCase() : "";
}

function toAttachmentType(v: unknown): AttachmentType {
  const s = asString(v)?.toUpperCase();
  return s === "A" || s === "B" || s === "C" ? s : "Z";
}

// ───────────────────────────── 하위 구조 변환 ─────────────────────────────

function mapSteps(raw: RawRecord): string[] {
  const arr = pick(raw, FIELD.steps);
  if (Array.isArray(arr)) {
    const names = arr
      .map((s) => (typeof s === "object" && s ? asString(pick(s as RawRecord, STEP_NAME_KEYS)) : asString(s)))
      .filter((s): s is string => !!s);
    if (names.length) return names;
  }
  const text = cleanText(pick(raw, FIELD.stepsText));
  if (!text) return [];
  // "서류전형 → 필기전형 → 면접" / "1. 서류 2. 필기" / 줄바꿈 구분 모두 처리
  return text
    .split(/\s*(?:→|->|>|\n|\d+\s*[.)]\s+)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 첨부 1건 변환. viewUrl 은 같은 출처 프록시 경로로 만든다
 * (pdf.js 가 외부 파일을 직접 받으면 CORS 에 막히고, 원본 URL 을 숨기기 위해).
 */
function mapAttachments(raw: RawRecord, postingId: string): Attachment[] {
  const arr = pick(raw, FIELD.files);
  if (!Array.isArray(arr)) return [];
  const out: Attachment[] = [];
  arr.forEach((f, i) => {
    if (!f || typeof f !== "object") return;
    const r = f as RawRecord;
    const fileName = asString(pick(r, FILE_NAME_KEYS)) ?? `첨부파일 ${i + 1}`;
    const rawUrl = asString(pick(r, FILE_URL_KEYS));
    // 샘플 공고문("/sample-docs/...")만 사이트 내부 경로로 두고, 나머지 상대경로는 원본 사이트 기준으로 푼다
    const sourceUrl = rawUrl?.startsWith(LOCAL_SAMPLE_PREFIX) && !rawUrl.includes("..")
      ? rawUrl
      : normalizeUrl(rawUrl, ATTACHMENT_URL_BASE);
    const sort = Number(asString(pick(r, FILE_SORT_KEYS)));
    out.push({
      type: toAttachmentType(pick(r, FILE_TYPE_KEYS)),
      fileName,
      extension: extensionOf(fileName),
      sourceUrl,
      viewUrl: null, // 아래에서 정렬 후 인덱스 기반으로 채움
      sortOrder: Number.isFinite(sort) && sort > 0 ? sort : i + 1,
    });
  });
  out.sort((a, b) => a.sortOrder - b.sortOrder);
  return out.map((a, idx) => ({
    ...a,
    viewUrl: a.sourceUrl ? `/api/attachments/${encodeURIComponent(postingId)}/${idx}` : null,
  }));
}

// ───────────────────────────── 진입점 ─────────────────────────────

/** 상세 응답 봉투 벗기기: { result: {...} } / { result: [{...}] } / {...} 모두 허용. ⚠️ 11 */
export function unwrapDetail(body: unknown): RawRecord | null {
  if (!body || typeof body !== "object") return null;
  const b = body as RawRecord;
  const r = "result" in b ? b.result : b;
  if (Array.isArray(r)) return (r[0] as RawRecord) ?? null;
  return r && typeof r === "object" ? (r as RawRecord) : null;
}

/** 목록 응답 봉투에서 item 배열 꺼내기 (`result` 는 ✅). */
export function unwrapList(body: unknown): { items: RawRecord[]; totalCount: number | null } {
  if (!body || typeof body !== "object") return { items: [], totalCount: null };
  const b = body as RawRecord;
  const items = Array.isArray(b.result) ? (b.result.filter((x) => x && typeof x === "object") as RawRecord[]) : [];
  const total = Number(b.totalCount);
  return { items, totalCount: Number.isFinite(total) ? total : null };
}

/**
 * 목록 item(+선택적으로 상세 result) → Posting.
 * 상세 값이 있으면 상세를 우선하고, 없는 필드는 목록 값으로 채운다.
 * 공고 일련번호가 없으면 식별이 불가능하므로 null 을 돌려준다.
 */
export function toPosting(listItem: RawRecord | null, detail?: RawRecord | null): Posting | null {
  const raw: RawRecord = { ...(listItem ?? {}), ...stripEmpty(detail ?? {}) };
  const sn = asString(pick(raw, FIELD.sn));
  if (!sn) return null;
  const id = sn;

  return {
    id,
    sourceSn: sn,
    institution: {
      code: asString(pick(raw, FIELD.institutionCode)),
      name: asString(pick(raw, FIELD.institutionName)) ?? "기관명 미상",
    },
    title: cleanText(pick(raw, FIELD.title)) ?? "(제목 없음)",
    startDate: parseYmd(pick(raw, FIELD.startDate)),
    endDate: parseYmd(pick(raw, FIELD.endDate)),
    regions: splitList(pick(raw, FIELD.regions)),
    jobFields: splitList(pick(raw, FIELD.jobFields)),
    hireTypes: splitList(pick(raw, FIELD.hireTypes)),
    recruitType: asString(pick(raw, FIELD.recruitType)),
    headcount: parseHeadcount(pick(raw, FIELD.headcount)),
    steps: mapSteps(raw),
    qualification: cleanText(pick(raw, FIELD.qualification)),
    preference: cleanText(pick(raw, FIELD.preference)),
    disqualification: cleanText(pick(raw, FIELD.disqualification)),
    srcUrl: normalizeUrl(pick(raw, FIELD.srcUrl)),
    attachments: mapAttachments(raw, id),
    noAttachmentReason: cleanText(pick(raw, FIELD.noAttachmentReason)),
  };
}

/** 상세의 빈 값이 목록의 유효한 값을 덮어쓰지 않도록 제거 */
function stripEmpty(r: RawRecord): RawRecord {
  const out: RawRecord = {};
  for (const [k, v] of Object.entries(r)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    out[k] = v;
  }
  return out;
}

/** 중복 제거 키: 기관(코드 우선, 없으면 기관명) + 공고번호 */
export function dedupeKey(p: Pick<Posting, "institution" | "sourceSn">): string {
  return `${p.institution.code ?? p.institution.name}::${p.sourceSn}`;
}
