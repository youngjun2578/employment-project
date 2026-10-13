import { collect } from "../collector/pipeline";
import { FixtureRecruitClient } from "../source/fixtureClient";
import type { PostingFilter, StoredPosting } from "../types";
import { MemoryPostingRepository } from "./memoryRepository";
import type { PostingRepository } from "./types";

/**
 * 샘플 모드 저장소: 수집 파이프라인을 fixture 클라이언트(data/sample/raw)로 돌린 결과를 메모리에 둔다.
 * 실제 수집과 같은 mapper·중복 제거 경로를 거치므로 샘플 화면이 곧 파이프라인 시험이 된다.
 * 날짜를 오늘 기준으로 이동하므로 하루 단위로 다시 만든다.
 */
export class SamplePostingRepository implements PostingRepository {
  private cache: { day: string; repo: Promise<MemoryPostingRepository> } | null = null;

  /** @param dir 가짜 응답 폴더(기본 data/sample/raw) */
  constructor(private readonly dir?: string) {}

  private load(): Promise<MemoryPostingRepository> {
    const day = new Date().toISOString().slice(0, 10);
    if (!this.cache || this.cache.day !== day) {
      const repo = new MemoryPostingRepository();
      this.cache = { day, repo: collect({ client: new FixtureRecruitClient(this.dir), repo }).then(() => repo) };
    }
    return this.cache.repo;
  }

  async list(filter?: PostingFilter): Promise<StoredPosting[]> {
    return (await this.load()).list(filter);
  }

  async get(id: string) {
    return (await this.load()).get(id);
  }

  async filterOptions() {
    return (await this.load()).filterOptions();
  }

  async saveAll(): Promise<void> {
    throw new Error("샘플 저장소는 읽기 전용입니다.");
  }
}
