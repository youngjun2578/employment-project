import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ConversionRecord } from "../../types";
import { defaultToolPaths, extractPdfText, hwpViaPyhwp, viaH2Orestart, type ConvertResult, type ToolPaths } from "./converters";
import { detectFormat, FORMAT_CONTENT_TYPE, IMAGE_FORMATS } from "./detect";
import type { AttachmentStore } from "./store";
import { Limiter } from "./tools";

export { detectFormat } from "./detect";
export { LocalFileAttachmentStore, type AttachmentStore } from "./store";

/** 원본 바이트를 가져오는 방법 (HTTP, 로컬 샘플 등) */
export type AttachmentFetcher = (sourceUrl: string, maxBytes: number) => Promise<Uint8Array>;

export interface AttachmentPipelineOptions {
  store: AttachmentStore;
  fetcher: AttachmentFetcher;
  tools?: ToolPaths;
  /** 원본 파일 크기 상한 (기본 30MB) */
  maxBytes?: number;
  /** 외부 도구 1회 실행 시간 제한 (기본 90초) */
  timeoutMs?: number;
  /** 동시 변환 수 (기본 2) */
  concurrency?: number;
  log?: (msg: string) => void;
}

export interface AttachmentInput {
  postingId: string;
  index: number;
  fileName: string;
  sourceUrl: string;
}

export class FileTooLargeError extends Error {}

/**
 * 첨부 1건을 받아 → 형식 감지 → (필요하면) PDF 변환 → 텍스트 추출 → 저장한다.
 * 어떤 실패도 예외로 던지지 않고 ConversionRecord 의 status/reason 으로 돌려준다(수집 전체가 멈추지 않게).
 */
export class AttachmentPipeline {
  private readonly tools: ToolPaths;
  private readonly limiter: Limiter;
  private readonly maxBytes: number;
  private readonly timeoutMs: number;

  constructor(private readonly opts: AttachmentPipelineOptions) {
    this.tools = opts.tools ?? defaultToolPaths();
    this.limiter = new Limiter(opts.concurrency ?? 2);
    this.maxBytes = opts.maxBytes ?? 30 * 1024 * 1024;
    this.timeoutMs = opts.timeoutMs ?? 90_000;
  }

  process(input: AttachmentInput): Promise<ConversionRecord> {
    return this.limiter.run(() => this.processOne(input));
  }

  private async processOne(input: AttachmentInput): Promise<ConversionRecord> {
    const processedAt = new Date().toISOString();
    const base: ConversionRecord = {
      status: "failed", sourceFormat: "unknown", viewFormat: "unsupported", viewUrl: null,
      textUrl: null, textStatus: "not-applicable", reason: null, sha256: null, bytes: null, method: null, processedAt,
    };

    let data: Uint8Array;
    try {
      data = await this.opts.fetcher(input.sourceUrl, this.maxBytes);
    } catch (e) {
      const tooBig = e instanceof FileTooLargeError;
      return { ...base, reason: tooBig ? `파일이 너무 큽니다(상한 ${Math.round(this.maxBytes / 1048576)}MB).` : `원본을 받지 못했습니다: ${errMsg(e)}` };
    }
    if (data.byteLength > this.maxBytes) {
      return { ...base, bytes: data.byteLength, reason: `파일이 너무 큽니다(상한 ${Math.round(this.maxBytes / 1048576)}MB).` };
    }
    const sha256 = createHash("sha256").update(data).digest("hex");
    const det = detectFormat(data);
    const rec: ConversionRecord = { ...base, sourceFormat: det.format, sha256, bytes: data.byteLength };
    const keyBase = `${safeSegment(input.postingId)}/${input.index}-${sha256.slice(0, 12)}`;

    try {
      // 1) 이미지: 그대로 저장
      if (IMAGE_FORMATS.includes(det.format)) {
        const ext = det.format === "jpeg" ? "jpg" : det.format;
        const obj = await this.opts.store.put(`${keyBase}.${ext}`, data, FORMAT_CONTENT_TYPE[det.format]!);
        return { ...rec, status: "success", viewFormat: "image", viewUrl: obj.url, method: "passthrough" };
      }
      // 2) PDF: 그대로 저장 + 텍스트 추출
      if (det.format === "pdf") {
        return await this.withWorkDir(async (dir) => {
          const pdfPath = path.join(dir, "source.pdf");
          await writeFile(pdfPath, data);
          return this.finishPdf(rec, keyBase, pdfPath, dir, "passthrough");
        });
      }
      // 3) HWP / HWPX: 변환
      if (det.format === "hwp" || det.format === "hwpx") {
        if (det.encrypted) return { ...rec, reason: "암호가 걸린 HWP 문서라 변환할 수 없습니다." };
        return await this.withWorkDir(async (dir) => {
          const src = path.join(dir, `source.${det.format}`);
          await writeFile(src, data);
          const attempts: ConvertResult[] = [];
          if (det.format === "hwp") {
            attempts.push(await hwpViaPyhwp(this.tools, src, dir, this.timeoutMs));
            if (!attempts[0].ok) attempts.push(await viaH2Orestart(this.tools, src, "hwp", dir, this.timeoutMs));
          } else {
            attempts.push(await viaH2Orestart(this.tools, src, "hwpx", dir, this.timeoutMs));
          }
          const ok = attempts.find((a) => a.ok);
          if (!ok?.pdfPath) {
            return { ...rec, reason: attempts.map((a) => `[${a.method ?? "?"}] ${a.reason}`).join(" → ") };
          }
          return this.finishPdf(rec, keyBase, ok.pdfPath, dir, ok.method ?? null);
        });
      }
      // 4) 그 밖(ZIP, 구형 OLE 문서, 알 수 없음): 미지원
      return { ...rec, status: "unsupported", reason: `사이트 안 열람을 지원하지 않는 형식입니다(${det.format}).` };
    } catch (e) {
      return { ...rec, status: "failed", reason: `처리 중 오류: ${errMsg(e)}` };
    }
  }

  private async finishPdf(rec: ConversionRecord, keyBase: string, pdfPath: string, dir: string, method: string | null): Promise<ConversionRecord> {
    const pdf = await readFile(pdfPath);
    const obj = await this.opts.store.put(`${keyBase}.pdf`, pdf, "application/pdf");
    const text = await extractPdfText(this.tools, pdfPath, dir, this.timeoutMs);
    let textUrl: string | null = null;
    if (text.status === "extracted") {
      textUrl = (await this.opts.store.put(`${keyBase}.txt`, text.text, "text/plain; charset=utf-8")).url;
    }
    return { ...rec, status: "success", viewFormat: "pdf", viewUrl: obj.url, textUrl, textStatus: text.status, method };
  }

  private async withWorkDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(path.join(tmpdir(), "recruit-attach-"));
    try {
      return await fn(dir);
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

function safeSegment(s: string): string {
  return s.replace(/[^\w-]/g, "_").slice(0, 64) || "posting";
}

function errMsg(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 200);
}
