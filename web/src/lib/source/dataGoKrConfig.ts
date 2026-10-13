/**
 * 공공데이터포털 「공공기관 채용정보 조회서비스」 호출 설정.
 * 실호출로 확인되지 않은 값은 모두 여기 모아 두었다. 키를 받은 뒤 이 파일만 고치면 된다.
 * 근거: recruit-probe/FINDINGS.md 1~2절, web/docs/alio-observation.md 8절(코드 정의서 미입수)
 */
export const DATA_GO_KR = {
  /** ✅ 공개 코드 2곳에서 확인 */
  baseUrl: "https://apis.data.go.kr/1051000/recruitment",
  /** ✅ */
  listPath: "list",
  /** ⚠️ 미확인. 상세 오퍼레이션 경로 */
  detailPath: "detail",
  /** ⚠️ 미확인. 상세 조회 키 파라미터명 (값은 목록의 recrutPblntSn) */
  detailIdParam: "sn",
  /** ✅ */
  pageParam: "pageNo",
  /** ✅ 최대 100으로 알려짐 */
  rowsParam: "numOfRows",
  maxRows: 100,
  /** ✅ 접수 중 공고 필터 */
  ongoingParam: "ongoingYn",
  ongoingValue: "Y",
  /** ✅ 응답 형식 */
  resultTypeParam: "resultType",
  resultTypeValue: "json",
  /** ✅ 정상 응답의 resultCode */
  successCodes: ["200", "00", "0000"],
} as const;

export type ApiErrorKind = "auth" | "expired" | "quota" | "ip" | "denied" | "no-service" | "server" | "network" | "parse" | "limit" | "unknown";

/**
 * data.go.kr 게이트웨이 공통 오류 코드(returnReasonCode / returnAuthMsg) → 사람이 읽을 메시지.
 * 포털 공통 규격이며, 이 API 의 개별 코드는 ⚠️ 코드 정의서 확인 필요.
 */
export const GATEWAY_ERRORS: Record<string, { kind: ApiErrorKind; message: string }> = {
  "1": { kind: "server", message: "제공기관 서버 내부 오류입니다(APPLICATION_ERROR). 잠시 후 다시 시도하세요." },
  "4": { kind: "server", message: "제공기관 서버 HTTP 오류입니다(HTTP_ERROR). 잠시 후 다시 시도하세요." },
  "12": { kind: "no-service", message: "해당 오픈API 서비스가 없거나 폐기되었습니다(NO_OPENAPI_SERVICE_ERROR). 엔드포인트 주소를 확인하세요." },
  "20": { kind: "denied", message: "서비스 접근이 거부되었습니다(SERVICE_ACCESS_DENIED_ERROR). 활용신청 승인 상태를 확인하세요." },
  "22": { kind: "quota", message: "일일 트래픽 한도를 넘었습니다(LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR). 내일 다시 시도하거나 운영계정 전환을 신청하세요." },
  "30": { kind: "auth", message: "등록되지 않은 서비스키입니다(SERVICE_KEY_IS_NOT_REGISTERED_ERROR). 이 API 를 따로 활용신청했는지, Decoding 키를 넣었는지 확인하세요. 승인 직후에는 반영까지 1~2시간 걸릴 수 있습니다." },
  "31": { kind: "expired", message: "활용기간이 만료된 서비스키입니다(DEADLINE_HAS_EXPIRED_ERROR). 포털에서 활용기간을 연장하세요." },
  "32": { kind: "ip", message: "등록되지 않은 IP 에서 호출했습니다(UNREGISTERED_IP_ERROR). 활용신청의 허용 IP 설정을 확인하세요." },
  "99": { kind: "unknown", message: "알 수 없는 오류입니다(UNKNOWN_ERROR)." },
};

/** returnAuthMsg 문자열 → 코드 (본문에 코드 없이 메시지만 올 때) */
export const AUTH_MSG_TO_CODE: Record<string, string> = {
  APPLICATION_ERROR: "1",
  HTTP_ERROR: "4",
  NO_OPENAPI_SERVICE_ERROR: "12",
  SERVICE_ACCESS_DENIED_ERROR: "20",
  LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR: "22",
  SERVICE_KEY_IS_NOT_REGISTERED_ERROR: "30",
  DEADLINE_HAS_EXPIRED_ERROR: "31",
  UNREGISTERED_IP_ERROR: "32",
  UNKNOWN_ERROR: "99",
};
