/**
 * 샘플 데이터 모드. NEXT_PUBLIC_USE_SAMPLE=false 일 때만 실제 수집 결과(data/postings.json)를 쓴다.
 * 값이 없으면 샘플 모드(실데이터가 아직 없으므로 안전한 기본값). 클라이언트 번들에도 인라인된다.
 */
export const USE_SAMPLE = process.env.NEXT_PUBLIC_USE_SAMPLE !== "false";

export const SITE_NAME = "공공채용 모아보기";
export const DATA_SOURCE_LABEL = "알리오 공공기관 채용정보(공공데이터포털)";
