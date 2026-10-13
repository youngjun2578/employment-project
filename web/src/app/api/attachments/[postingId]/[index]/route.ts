import { CONTENT_TYPE, ALLOWED_ATTACHMENT_HOSTS, LOCAL_ATTACHMENT_PREFIX, MAX_ATTACHMENT_BYTES, viewerKind } from "@/lib/attachments";
import { getRepository } from "@/lib/repository";

/**
 * 첨부파일 열람용 같은 출처 엔드포인트.
 * - 브라우저(pdf.js)가 외부 파일을 직접 받으면 CORS 에 막히므로 서버가 대신 받아 inline 으로 내려준다.
 * - 임의 URL 을 받지 않고 (공고 ID, 첨부 순번)으로만 찾으므로 열린 프록시가 되지 않는다.
 * - 열람 가능한 형식(PDF·이미지)만 내려준다. HWP 등은 변환 파이프라인 도입 후 처리.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ postingId: string; index: string }> }) {
  const { postingId, index } = await ctx.params;
  const posting = await getRepository().get(decodeURIComponent(postingId));
  const att = posting?.attachments[Number(index)];
  if (!posting || !att?.sourceUrl) return new Response("첨부를 찾을 수 없습니다.", { status: 404 });

  const kind = viewerKind(att.extension);
  if (kind === "unsupported") return new Response("사이트 안에서 열람할 수 없는 형식입니다.", { status: 415 });

  // 샘플: public/ 의 정적 파일로 보낸다
  if (att.sourceUrl.startsWith(LOCAL_ATTACHMENT_PREFIX) && !att.sourceUrl.includes("..")) {
    return new Response(null, { status: 307, headers: { Location: att.sourceUrl } });
  }

  let url: URL;
  try {
    url = new URL(att.sourceUrl);
  } catch {
    return new Response("잘못된 첨부 주소입니다.", { status: 404 });
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return new Response(null, { status: 404 });
  if (!ALLOWED_ATTACHMENT_HOSTS.includes(url.hostname)) {
    return new Response("허용되지 않은 첨부 호스트입니다.", { status: 403 });
  }

  // TODO(실데이터): 실제 첨부 다운로드 동작(리다이렉트, 로그인 요구, 파일명 인코딩)을 확인한 뒤 검증할 것.
  //                 매 요청 원본을 받지 말고 수집 단계에서 저장소(Blob 등)에 캐시하는 방식으로 바꾸는 것을 권장.
  const upstream = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!upstream || !upstream.ok || !upstream.body) {
    return new Response("원본 첨부를 가져오지 못했습니다.", { status: 502 });
  }
  const len = Number(upstream.headers.get("content-length") ?? 0);
  if (len > MAX_ATTACHMENT_BYTES) return new Response("파일이 너무 큽니다.", { status: 413 });

  return new Response(upstream.body, {
    headers: {
      "Content-Type": CONTENT_TYPE[att.extension] ?? "application/octet-stream",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(att.fileName)}`,
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
