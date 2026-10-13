import path from "node:path";
import { LocalFileAttachmentStore } from "@/lib/pipeline/attachments/store";

/**
 * 로컬 저장소(data/attachments/)에 저장된 변환 결과를 내려준다.
 * 키에 내용 해시가 들어 있어 같은 키의 내용은 바뀌지 않으므로 오래 캐시한다.
 * 운영에서는 Blob 같은 외부 저장소 URL 로 직접 서빙하는 것을 권장 → docs/DEPLOY.md
 */
const TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8",
};

const store = new LocalFileAttachmentStore();

export async function GET(_req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  const key = (await ctx.params).key.map((s) => decodeURIComponent(s)).join("/");
  const type = TYPES[path.extname(key).toLowerCase()];
  if (!type) return new Response("지원하지 않는 형식입니다.", { status: 404 });
  const file = await store.open(key).catch(() => null);
  if (!file) return new Response("파일을 찾을 수 없습니다.", { status: 404 });
  return new Response(file.stream, {
    headers: {
      "Content-Type": type,
      "Content-Length": String(file.bytes),
      "Content-Disposition": "inline",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
