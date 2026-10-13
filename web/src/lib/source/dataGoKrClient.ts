import type { ListQuery, RecruitApiClient } from "./client";

/**
 * 실제 공공데이터포털 API 클라이언트 — TODO(실데이터)
 *
 * 이 환경에서는 apis.data.go.kr 접속이 막혀 있고 서비스키도 없어서 구현하지 않았다.
 * 서비스키는 환경변수 DATA_GO_KR_KEY 에서만 읽는다(.env.local 또는 GitHub Secrets).
 * 키는 절대 로그·예외 메시지·저장 파일에 남기지 않는다 → 모든 출력에 redactKey() 를 거칠 것.
 *
 * 구현 시 확인할 것 (recruit-probe/FINDINGS.md 참고)
 *  - 목록: GET {BASE}/list?serviceKey&resultType=json&pageNo&numOfRows&ongoingYn=Y   (✅)
 *  - 상세: GET {BASE}/detail?sn=<recrutPblntSn>                                     (⚠️ 경로·파라미터명)
 *  - 오류 응답: HTTP 403 + SERVICE_KEY_IS_NOT_REGISTERED_ERROR (활용신청 누락)        (✅)
 *  - 개발계정 1일 1,000건 → 호출 수 상한(maxCalls)을 두고, 상세는 변경된 공고만 다시 받기
 *  - 재시도: 5xx/네트워크 오류만 지수 백오프로 2~3회, 4xx 는 즉시 실패
 */
export const DATA_GO_KR_BASE = "https://apis.data.go.kr/1051000/recruitment";

export class MissingServiceKeyError extends Error {
  constructor() {
    super("환경변수 DATA_GO_KR_KEY 가 없습니다. .env.local 또는 GitHub Secrets 에 설정하세요.");
  }
}

/** 문자열에서 서비스키(원문·URL 인코딩)와 serviceKey 쿼리값을 가린다 */
export function redactKey(text: string, key: string | undefined = process.env.DATA_GO_KR_KEY): string {
  let s = text;
  if (key) {
    for (const k of new Set([key, encodeURIComponent(key)])) s = s.split(k).join("***");
  }
  return s.replace(/(serviceKey=)[^&\s"']+/gi, "$1***");
}

export class DataGoKrRecruitClient implements RecruitApiClient {
  readonly name = "data.go.kr";
  readonly #key: string; // private field: JSON.stringify·console.log 에 드러나지 않게

  constructor(key: string | undefined = process.env.DATA_GO_KR_KEY) {
    if (!key) throw new MissingServiceKeyError();
    this.#key = key;
  }

  /** 요청 URL 조립(키 포함). 이 값은 로그에 쓰지 말고, 로그에는 redactKey(url) 을 쓴다 */
  protected buildUrl(op: "list" | "detail", params: Record<string, string | number>): string {
    const u = new URL(`${DATA_GO_KR_BASE}/${op}`);
    u.searchParams.set("serviceKey", this.#key);
    u.searchParams.set("resultType", "json");
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
    return u.toString();
  }

  async fetchList(query: ListQuery): Promise<unknown> {
    void query;
    // TODO(실데이터): fetch(this.buildUrl("list", { pageNo, numOfRows, ...(ongoingOnly ? { ongoingYn: "Y" } : {}) }))
    //                 → resultCode 확인 → JSON 반환. 오류 메시지는 redactKey() 로 감쌀 것.
    throw new Error("DataGoKrRecruitClient.fetchList 는 아직 구현되지 않았습니다 (실제 응답 확인 후 구현).");
  }

  async fetchDetail(sn: string): Promise<unknown | null> {
    void sn;
    // TODO(실데이터): fetch(this.buildUrl("detail", { sn })) — 경로·파라미터명은 ⚠️ 미확인
    throw new Error("DataGoKrRecruitClient.fetchDetail 는 아직 구현되지 않았습니다 (실제 응답 확인 후 구현).");
  }
}
