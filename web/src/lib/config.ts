/**
 * 샘플 데이터 모드. NEXT_PUBLIC_USE_SAMPLE=false 일 때만 실제 수집 결과(data/postings.json)를 쓴다.
 * 값이 없으면 샘플 모드(실데이터가 아직 없으므로 안전한 기본값). 클라이언트 번들에도 인라인된다.
 */
export const USE_SAMPLE = process.env.NEXT_PUBLIC_USE_SAMPLE !== "false";

/**
 * 샘플 모드에서 쓸 가짜 데이터 묶음(서버 전용, 실행 시점에 읽음).
 * "stress" 면 화면 극단 케이스 검증용 data/sample-stress/raw 를 쓴다. 기본 샘플과 섞지 않는다.
 */
export function sampleDataset(): "default" | "stress" {
  return process.env.SAMPLE_DATASET === "stress" ? "stress" : "default";
}

export const SITE_NAME = "공공채용 모아보기";
export const DATA_SOURCE_LABEL = "알리오 공공기관 채용정보(공공데이터포털)";

/** 사이트 기본 주소(메타데이터·sitemap 절대 URL). 배포 시 NEXT_PUBLIC_SITE_URL 로 지정 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");

/** NCS 수리능력 맛보기 진단 사이트 주소 + 유입 경로 파라미터 */
export function ncsUrl(): string {
  const base = process.env.NEXT_PUBLIC_NCS_URL || "https://ncsmath.com";
  try {
    const u = new URL(base);
    u.searchParams.set("utm_source", "recruit");
    u.searchParams.set("utm_medium", "posting");
    return u.toString();
  } catch {
    return "https://ncsmath.com/?utm_source=recruit&utm_medium=posting";
  }
}

/** 페이지별 openGraph 는 레이아웃 값을 덮어쓰므로 공통 항목을 함께 넣는다 */
export const OG_BASE = { siteName: SITE_NAME, locale: "ko_KR" } as const;
