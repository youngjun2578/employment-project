import { createReadStream } from "node:fs";
import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

/**
 * 변환 결과 저장소. 지금은 로컬 파일시스템 구현체만 있다.
 * Vercel Blob·S3 같은 구현체는 같은 인터페이스로 추가하고, put() 이 돌려주는 url 을 그대로 화면에서 쓴다.
 */
export interface StoredObject {
  key: string;
  /** 화면에서 바로 쓰는 열람 URL (로컬: /files/<key>, Blob: 공개 URL) */
  url: string;
  bytes: number;
  contentType: string;
}

export interface AttachmentStore {
  put(key: string, data: Uint8Array | string, contentType: string): Promise<StoredObject>;
  exists(key: string): Promise<boolean>;
  /** 열람 URL (저장 여부는 확인하지 않음) */
  urlFor(key: string): string;
}

/** 키: 영문·숫자·-·_·. 과 / 만 허용, .. 금지 */
export function assertSafeKey(key: string): void {
  if (!/^[\w.-]+(\/[\w.-]+)*$/.test(key) || key.split("/").some((p) => p === "." || p === "..")) {
    throw new Error(`잘못된 저장 키입니다: ${key}`);
  }
}

export const LOCAL_FILES_ROUTE = "/files";

export class LocalFileAttachmentStore implements AttachmentStore {
  constructor(
    readonly rootDir: string = path.join(process.cwd(), "data", "attachments"),
    private readonly publicBase: string = LOCAL_FILES_ROUTE,
  ) {}

  private resolve(key: string): string {
    assertSafeKey(key);
    const full = path.resolve(this.rootDir, key);
    if (!full.startsWith(path.resolve(this.rootDir) + path.sep)) throw new Error("저장 경로가 루트 밖입니다.");
    return full;
  }

  urlFor(key: string): string {
    assertSafeKey(key);
    return `${this.publicBase}/${key}`;
  }

  async put(key: string, data: Uint8Array | string, contentType: string): Promise<StoredObject> {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    const tmp = `${full}.${process.pid}.tmp`;
    await writeFile(tmp, data);
    await rename(tmp, full);
    const bytes = typeof data === "string" ? Buffer.byteLength(data) : data.byteLength;
    return { key, url: this.urlFor(key), bytes, contentType };
  }

  async exists(key: string): Promise<boolean> {
    try {
      return (await stat(this.resolve(key))).isFile();
    } catch {
      return false;
    }
  }

  /** /files 라우트용: 스트림과 크기. 없으면 null */
  async open(key: string): Promise<{ stream: ReadableStream; bytes: number } | null> {
    let full: string;
    try {
      full = this.resolve(key);
      const s = await stat(full);
      if (!s.isFile()) return null;
      return { stream: Readable.toWeb(createReadStream(full)) as ReadableStream, bytes: s.size };
    } catch {
      return null;
    }
  }
}
