import { filterOptions, queryPostings } from "../postingQuery";
import type { PostingFilter, StoredPosting } from "../types";
import type { PostingRepository } from "./types";

/** 메모리 구현체 (샘플 모드, 테스트, 수집기 dry-run 용) */
export class MemoryPostingRepository implements PostingRepository {
  constructor(private postings: StoredPosting[] = []) {}

  async list(filter?: PostingFilter) {
    return queryPostings(this.postings, filter);
  }

  async get(id: string) {
    return this.postings.find((p) => p.id === id) ?? null;
  }

  async filterOptions() {
    return filterOptions(this.postings);
  }

  async saveAll(postings: StoredPosting[]) {
    this.postings = [...postings];
  }
}
