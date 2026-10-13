import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { filterOptions, queryPostings } from "../postingQuery";
import type { PostingFilter, StoredPosting } from "../types";
import type { PostingRepository } from "./types";

interface FileShape {
  generatedAt: string;
  source: string;
  postings: StoredPosting[];
}

/** JSON 파일 하나에 전체 공고를 보관하는 구현체 */
export class JsonFilePostingRepository implements PostingRepository {
  constructor(private readonly filePath: string) {}

  protected async load(): Promise<StoredPosting[]> {
    try {
      const data = JSON.parse(await readFile(this.filePath, "utf-8")) as Partial<FileShape>;
      return Array.isArray(data.postings) ? data.postings : [];
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return []; // 아직 수집 전
      throw e;
    }
  }

  async list(filter?: PostingFilter) {
    return queryPostings(await this.load(), filter);
  }

  async get(id: string) {
    return (await this.load()).find((p) => p.id === id) ?? null;
  }

  async filterOptions() {
    return filterOptions(await this.load());
  }

  async saveAll(postings: StoredPosting[], meta = { source: "unknown" }) {
    const body: FileShape = { generatedAt: new Date().toISOString(), source: meta.source, postings };
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(body, null, 2) + "\n", "utf-8");
    await rename(tmp, this.filePath); // 쓰는 도중 읽어도 깨진 파일을 보지 않게
  }
}
