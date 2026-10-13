import { dedupeKey, toPosting, unwrapDetail, unwrapList } from "../mapper";
import { filterOptions, queryPostings } from "../postingQuery";
import { FixtureRecruitClient } from "../source/fixtureClient";
import type { PostingFilter, StoredPosting } from "../types";
import type { PostingRepository } from "./types";

/**
 * 샘플 모드 저장소: data/sample/raw 의 가짜 응답을 fixture 클라이언트 → mapper 로 읽어 메모리에 둔다.
 * 날짜가 오늘 기준으로 이동하므로 하루 단위로 다시 만든다.
 */
export class SamplePostingRepository implements PostingRepository {
  private cache: { day: string; data: Promise<StoredPosting[]> } | null = null;

  private load(): Promise<StoredPosting[]> {
    const day = new Date().toISOString().slice(0, 10);
    if (!this.cache || this.cache.day !== day) {
      this.cache = { day, data: build() };
    }
    return this.cache.data;
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

  async saveAll(): Promise<void> {
    throw new Error("샘플 저장소는 읽기 전용입니다.");
  }
}

async function build(): Promise<StoredPosting[]> {
  const client = new FixtureRecruitClient();
  const { items } = unwrapList(await client.fetchList({ pageNo: 1, numOfRows: 1000 }));
  const now = new Date().toISOString();
  const out: StoredPosting[] = [];
  for (const item of items) {
    const p = toPosting(item, unwrapDetail(await client.fetchDetail(String(item.recrutPblntSn ?? ""))));
    if (!p) continue;
    out.push({
      ...p,
      meta: { dedupeKey: dedupeKey(p), firstSeenAt: now, lastSeenAt: now, updatedAt: now, contentHash: "sample", sourceState: "listed" },
    });
  }
  return out;
}
