/** 첨부 열람 방식 판별 (클라이언트·서버 공용) */
export type ViewerKind = "pdf" | "image" | "unsupported";

export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "bmp"];

export function viewerKind(extension: string): ViewerKind {
  if (extension === "pdf") return "pdf";
  if (IMAGE_EXTENSIONS.includes(extension)) return "image";
  return "unsupported";
}

export const CONTENT_TYPE: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
};

/**
 * 프록시로 가져와도 되는 원본 호스트 (열린 프록시가 되지 않도록 반드시 허용 목록으로만 연다).
 * 잡알리오 화면 관찰 결과 첨부는 www.alio.go.kr/download/download.json 에서 내려온다.
 * ⚠️ API 응답의 첨부 URL 호스트는 실호출로 다시 확인할 것.
 */
export const ALLOWED_ATTACHMENT_HOSTS = ["www.alio.go.kr", "alio.go.kr", "job.alio.go.kr"];

/** 사이트 내부 정적 파일로 허용하는 경로 접두사(샘플 공고문) */
export const LOCAL_ATTACHMENT_PREFIX = "/sample-docs/";

export const MAX_ATTACHMENT_BYTES = 30 * 1024 * 1024;
