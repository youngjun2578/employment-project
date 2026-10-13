import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { ALLOWED_ATTACHMENT_HOSTS, LOCAL_ATTACHMENT_PREFIX } from "../../attachments";
import { FileTooLargeError, type AttachmentFetcher } from "./index";

/** 샘플 공고문(/sample-docs/...)을 public/ 에서 읽는다 */
export function localSampleFetcher(publicDir = path.join(process.cwd(), "public")): AttachmentFetcher {
  return async (sourceUrl, maxBytes) => {
    if (!sourceUrl.startsWith(LOCAL_ATTACHMENT_PREFIX) || sourceUrl.includes("..")) {
      throw new Error("샘플 경로가 아닙니다.");
    }
    const full = path.join(publicDir, sourceUrl);
    const s = await stat(full).catch(() => null);
    if (!s?.isFile()) throw new Error("파일이 없습니다.");
    if (s.size > maxBytes) throw new FileTooLargeError();
    return new Uint8Array(await readFile(full));
  };
}

/**
 * 원본 사이트에서 첨부를 받는다. 허용 호스트만, 크기 상한을 넘으면 받는 도중 끊는다.
 * ⚠️ www.alio.go.kr 의 실제 다운로드 동작(리다이렉트·쿠키)은 미검증 → docs/alio-observation.md
 */
export function httpFetcher(opts: { timeoutMs?: number; allowedHosts?: string[] } = {}): AttachmentFetcher {
  const allowed = opts.allowedHosts ?? ALLOWED_ATTACHMENT_HOSTS;
  return async (sourceUrl, maxBytes) => {
    const url = new URL(sourceUrl);
    if (!["http:", "https:"].includes(url.protocol) || !allowed.includes(url.hostname)) {
      throw new Error(`허용되지 않은 첨부 호스트입니다: ${url.hostname}`);
    }
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
      headers: { "User-Agent": "public-recruit-collector/0.1" },
    });
    // 리다이렉트 끝 주소도 허용 호스트인지 확인
    if (!allowed.includes(new URL(res.url || sourceUrl).hostname)) throw new Error("허용되지 않은 호스트로 리다이렉트되었습니다.");
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > maxBytes) throw new FileTooLargeError();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      total += chunk.byteLength;
      if (total > maxBytes) throw new FileTooLargeError();
      chunks.push(chunk);
    }
    return new Uint8Array(Buffer.concat(chunks));
  };
}

/** 샘플 경로면 로컬, 아니면 HTTP */
export function defaultFetcher(): AttachmentFetcher {
  const local = localSampleFetcher();
  const http = httpFetcher();
  return (url, max) => (url.startsWith(LOCAL_ATTACHMENT_PREFIX) ? local(url, max) : http(url, max));
}
