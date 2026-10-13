import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ListQuery, RecruitApiClient } from "./client";
import { AUTH_MSG_TO_CODE, DATA_GO_KR, GATEWAY_ERRORS, type ApiErrorKind } from "./dataGoKrConfig";

/**
 * 공공데이터포털 채용정보 API 클라이언트.
 *
 * - 서비스키는 환경변수 DATA_GO_KR_KEY 에서만 읽고 private 필드(#key)에 둔다.
 * - 키가 쿼리스트링에 들어가므로, 오류 메시지·로그에는 URL 을 직접 넣지 않고 redactKey() 를 거친다.
 * - data.go.kr 은 HTTP 200 이어도 본문이 XML 오류 봉투일 수 있어 본문을 항상 검사한다.
 * - 미확인 경로·파라미터명은 ./dataGoKrConfig.ts 에 모여 있다.
 */
export const DATA_GO_KR_BASE = DATA_GO_KR.baseUrl;

export class MissingServiceKeyError extends Error {
  constructor() {
    super("환경변수 DATA_GO_KR_KEY 가 없습니다. .env.local 또는 GitHub Secrets 에 설정하세요.");
    this.name = "MissingServiceKeyError";
  }
}

/** 문자열에서 서비스키(원문·URL 인코딩)와 serviceKey 쿼리값을 가린다 */
export function redactKey(text: string, key: string | undefined = process.env.DATA_GO_KR_KEY): string {
  let s = text;
  if (key) {
    for (const k of new Set([key, encodeURIComponent(key), encodeURIComponent(key).replace(/%20/g, "+")])) {
      if (k) s = s.split(k).join("***");
    }
  }
  return s.replace(/(serviceKey=)[^&\s"'<>]+/gi, "$1***");
}

export class DataGoKrApiError extends Error {
  constructor(
    message: string,
    readonly kind: ApiErrorKind,
    readonly retryable: boolean,
    readonly code: string | null = null,
    readonly httpStatus: number | null = null,
  ) {
    super(message);
    this.name = "DataGoKrApiError";
  }

  /** 다시 호출해도 소용없고 한도만 쓰는 오류 → 수집 전체를 멈춘다 */
  get fatal(): boolean {
    return ["auth", "expired", "quota", "ip", "denied", "no-service", "limit"].includes(this.kind);
  }
}

// ───────────────────────────── 일일 호출 상한 ─────────────────────────────

/** KST 날짜 기준 호출 수를 센다. 파일 경로를 주면 실행 간에도 누적한다 */
export class CallBudget {
  private day = "";
  private used = 0;
  private loaded = false;

  constructor(readonly limit: number = 300, private readonly file?: string, private readonly now: () => Date = () => new Date()) {}

  private today(): string {
    return new Date(this.now().getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
  }

  private async load() {
    if (this.loaded) return;
    this.loaded = true;
    if (!this.file) return;
    try {
      const d = JSON.parse(await readFile(this.file, "utf-8"));
      if (typeof d.day === "string" && Number.isFinite(d.used)) {
        this.day = d.day;
        this.used = d.used;
      }
    } catch {
      /* 처음 실행 */
    }
  }

  /** 1건을 쓸 수 있으면 기록하고, 상한이면 오류 */
  async consume(): Promise<void> {
    await this.load();
    const today = this.today();
    if (this.day !== today) {
      this.day = today;
      this.used = 0;
    }
    if (this.used >= this.limit) {
      throw new DataGoKrApiError(`오늘 호출 상한(${this.limit}건)에 도달해 호출을 멈췄습니다. 내일 다시 실행하세요.`, "limit", false);
    }
    this.used++;
    if (this.file) {
      await mkdir(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify({ day: this.day, used: this.used }));
      await rename(tmp, this.file);
    }
  }

  get usedToday(): number {
    return this.day === this.today() ? this.used : 0;
  }
}

// ───────────────────────────── 응답 해석 ─────────────────────────────

function xmlTag(body: string, tag: string): string | null {
  const m = body.match(new RegExp(`<${tag}>\\s*([^<]*?)\\s*</${tag}>`, "i"));
  return m ? m[1] : null;
}

function gatewayError(code: string | null, authMsg: string | null, errMsg: string | null, httpStatus: number | null): DataGoKrApiError {
  const resolved = code ?? (authMsg ? AUTH_MSG_TO_CODE[authMsg] ?? null : null);
  const known = resolved ? GATEWAY_ERRORS[resolved] : undefined;
  if (known) {
    return new DataGoKrApiError(known.message, known.kind, known.kind === "server", resolved, httpStatus);
  }
  const detail = [authMsg, errMsg].filter(Boolean).join(" / ") || "내용 없음";
  return new DataGoKrApiError(`공공데이터포털 오류(${resolved ?? "코드 없음"}): ${detail}`, "unknown", false, resolved, httpStatus);
}

/**
 * 본문을 해석한다. 정상이면 JSON 객체, 오류 봉투면 DataGoKrApiError 를 던진다.
 * 처리하는 형태:
 *  - JSON { resultCode, resultMsg, totalCount, result }                 (이 API, ✅)
 *  - JSON { response: { header: { resultCode, resultMsg }, body } }    (포털 공통 규격)
 *  - JSON/XML cmmMsgHeader { errMsg, returnAuthMsg, returnReasonCode }  (게이트웨이 오류)
 */
export function parseBody(text: string, httpStatus: number): Record<string, unknown> {
  const trimmed = text.trim();
  if (trimmed.startsWith("<")) {
    const code = xmlTag(trimmed, "returnReasonCode");
    const auth = xmlTag(trimmed, "returnAuthMsg");
    const err = xmlTag(trimmed, "errMsg");
    if (code || auth || err) throw gatewayError(code, auth, err, httpStatus);
    const rc = xmlTag(trimmed, "resultCode");
    if (rc && !(DATA_GO_KR.successCodes as readonly string[]).includes(rc)) {
      throw new DataGoKrApiError(`API 오류(${rc}): ${xmlTag(trimmed, "resultMsg") ?? ""}`.trim(), "unknown", false, rc, httpStatus);
    }
    throw new DataGoKrApiError("JSON 대신 XML 응답을 받았습니다. resultType 파라미터를 확인하세요.", "parse", false, null, httpStatus);
  }
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(trimmed);
  } catch {
    throw new DataGoKrApiError(`응답을 해석할 수 없습니다: ${trimmed.slice(0, 80) || "(빈 본문)"}`, "parse", httpStatus >= 500, null, httpStatus);
  }
  const header = (json.cmmMsgHeader ?? (json.OpenAPI_ServiceResponse as Record<string, unknown> | undefined)?.cmmMsgHeader ?? json) as Record<string, unknown>;
  if (header.returnReasonCode || header.returnAuthMsg) {
    throw gatewayError(str(header.returnReasonCode), str(header.returnAuthMsg), str(header.errMsg), httpStatus);
  }
  const resp = json.response as { header?: Record<string, unknown>; body?: Record<string, unknown> } | undefined;
  const resultCode = str(json.resultCode) ?? str(resp?.header?.resultCode);
  if (resultCode !== null && !(DATA_GO_KR.successCodes as readonly string[]).includes(resultCode)) {
    const msg = str(json.resultMsg) ?? str(resp?.header?.resultMsg) ?? "";
    throw new DataGoKrApiError(`API 오류(${resultCode}): ${msg}`.trim(), "unknown", false, resultCode, httpStatus);
  }
  return json;
}

function str(v: unknown): string | null {
  return v === null || v === undefined || v === "" ? null : String(v);
}

// ───────────────────────────── 클라이언트 ─────────────────────────────

export interface DataGoKrClientOptions {
  key?: string;
  /** 테스트용 모의 서버 주소 등 */
  baseUrl?: string;
  budget?: CallBudget;
  /** 5xx·네트워크 오류 재시도 횟수 (기본 3회, 최초 호출 제외) */
  maxRetries?: number;
  /** 첫 재시도 대기(ms). 이후 2배씩 (기본 1000ms) */
  retryBaseMs?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  log?: (msg: string) => void;
}

export class DataGoKrRecruitClient implements RecruitApiClient {
  readonly name = "data.go.kr";
  readonly #key: string; // JSON.stringify·console.log 에 드러나지 않게 private 필드
  private readonly baseUrl: string;
  readonly budget: CallBudget;
  private readonly maxRetries: number;
  private readonly retryBaseMs: number;
  private readonly timeoutMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly log: (msg: string) => void;

  constructor(opts: DataGoKrClientOptions = {}) {
    const key = opts.key ?? process.env.DATA_GO_KR_KEY;
    if (!key) throw new MissingServiceKeyError();
    this.#key = key;
    this.baseUrl = (opts.baseUrl ?? DATA_GO_KR.baseUrl).replace(/\/+$/, "");
    this.budget = opts.budget ?? new CallBudget(300);
    this.maxRetries = opts.maxRetries ?? 3;
    this.retryBaseMs = opts.retryBaseMs ?? 1000;
    this.timeoutMs = opts.timeoutMs ?? 20_000;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.log = (m) => (opts.log ?? (() => {}))(this.redact(m));
  }

  /** 이 클라이언트의 키로 가린다 */
  redact(text: string): string {
    return redactKey(text, this.#key);
  }

  /** 요청 URL 조립(키 포함). 이 값은 로그·오류에 쓰지 말 것 */
  protected buildUrl(op: string, params: Record<string, string | number>): string {
    const u = new URL(`${this.baseUrl}/${op}`);
    u.searchParams.set("serviceKey", this.#key);
    u.searchParams.set(DATA_GO_KR.resultTypeParam, DATA_GO_KR.resultTypeValue);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
    return u.toString();
  }

  private async request(op: string, params: Record<string, string | number>): Promise<Record<string, unknown>> {
    const url = this.buildUrl(op, params);
    const shown = this.redact(url);
    let attempt = 0;
    for (;;) {
      await this.budget.consume(); // 재시도도 호출 수에 포함
      let err: DataGoKrApiError;
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(this.timeoutMs), headers: { Accept: "application/json" } });
        const text = await res.text();
        if (res.status === 429) {
          throw new DataGoKrApiError(GATEWAY_ERRORS["22"].message, "quota", false, "22", 429);
        }
        if (res.status >= 500) {
          // 5xx 본문이 게이트웨이 오류 봉투면 그 의미를 따르고, 아니면 재시도 대상 서버 오류
          try {
            parseBody(text, res.status);
          } catch (e) {
            if (e instanceof DataGoKrApiError && e.kind !== "parse") throw e;
          }
          throw new DataGoKrApiError(`제공기관 서버 오류(HTTP ${res.status})입니다.`, "server", true, null, res.status);
        }
        const body = parseBody(text, res.status); // 200 이어도 오류 봉투면 여기서 던짐
        if (!res.ok) {
          throw new DataGoKrApiError(`HTTP ${res.status} 오류입니다.`, res.status === 401 || res.status === 403 ? "auth" : "unknown", false, null, res.status);
        }
        this.log(`[${res.status}] ${shown}`);
        return body;
      } catch (e) {
        err = e instanceof DataGoKrApiError
          ? e
          : new DataGoKrApiError(`네트워크 오류: ${this.redact(e instanceof Error ? e.message : String(e))}`, "network", true);
      }
      if (!err.retryable || attempt >= this.maxRetries) {
        // 스택트레이스에도 URL·키가 남지 않도록 메시지와 스택을 가린다
        err.message = this.redact(err.message);
        if (err.stack) err.stack = this.redact(err.stack);
        throw err;
      }
      const wait = this.retryBaseMs * 2 ** attempt;
      attempt++;
      this.log(`재시도 ${attempt}/${this.maxRetries} (${wait}ms 후): ${err.message} — ${shown}`);
      await this.sleep(wait);
    }
  }

  async fetchList(query: ListQuery): Promise<unknown> {
    const params: Record<string, string | number> = {
      [DATA_GO_KR.pageParam]: Math.max(1, Math.floor(query.pageNo)),
      [DATA_GO_KR.rowsParam]: Math.min(DATA_GO_KR.maxRows, Math.max(1, Math.floor(query.numOfRows))),
    };
    if (query.ongoingOnly) params[DATA_GO_KR.ongoingParam] = DATA_GO_KR.ongoingValue;
    return this.request(DATA_GO_KR.listPath, params);
  }

  async fetchDetail(sn: string): Promise<unknown | null> {
    if (!/^[\w-]+$/.test(sn)) return null;
    const body = await this.request(DATA_GO_KR.detailPath, { [DATA_GO_KR.detailIdParam]: sn });
    const r = body.result;
    if (r === null || r === undefined || (Array.isArray(r) && r.length === 0)) return null;
    return body;
  }
}
