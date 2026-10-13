import assert from "node:assert/strict";
import { test } from "node:test";
import { MemoryPostingRepository } from "../repository/memoryRepository";
import type { ListQuery, RecruitApiClient } from "../source/client";
import { collect } from "./pipeline";

class FakeClient implements RecruitApiClient {
  readonly name = "fake";
  calls = 0;
  constructor(public items: Record<string, unknown>[], public details: Record<string, Record<string, unknown>> = {}) {}
  async fetchList({ pageNo, numOfRows }: ListQuery) {
    this.calls++;
    return { totalCount: this.items.length, result: this.items.slice((pageNo - 1) * numOfRows, pageNo * numOfRows) };
  }
  async fetchDetail(sn: string) {
    this.calls++;
    return this.details[sn] ? { result: this.details[sn] } : null;
  }
}

const now = new Date("2026-10-13T03:00:00Z");
const item = (sn: number, extra: Record<string, unknown> = {}) => ({
  recrutPblntSn: sn, pblntInstCd: "SMPL-A", instNm: "샘플공사 A", recrutPbancTtl: `공고 ${sn}`,
  pbancBgngYmd: "20261001", pbancEndYmd: "20261030", ...extra,
});

test("중복 제거·잘못된 항목 건너뛰기·상세 병합", async () => {
  const client = new FakeClient(
    [item(1), item(1), item(2), { instNm: "번호 없음" }],
    { "1": { aplyQlfcCn: "자격 1", files: [{ atchType: "A", atchFileNm: "a.pdf", url: "https://job.alio.go.kr/x" }] } },
  );
  const repo = new MemoryPostingRepository();
  const s = await collect({ client, repo, now });
  assert.equal(s.listed, 4);
  assert.equal(s.duplicates, 1);
  assert.equal(s.skippedInvalid, 1);
  assert.equal(s.created, 2);
  const p1 = await repo.get("1");
  assert.equal(p1?.qualification, "자격 1");
  assert.equal(p1?.attachments[0].viewUrl, "/api/attachments/1/0");
  assert.equal(p1?.meta.dedupeKey, "SMPL-A::1");
});

test("재수집: 변경 감지, 목록에서 빠진 공고 표시, 오래 마감된 공고 정리", async () => {
  const repo = new MemoryPostingRepository();
  await collect({ client: new FakeClient([item(1), item(2), item(3, { pbancEndYmd: "20260101" })]), repo, now });
  const first = await repo.get("1");

  const later = new Date("2026-10-14T03:00:00Z");
  const s = await collect({
    client: new FakeClient([item(1), item(2, { recrutPbancTtl: "공고 2 (정정)" })]),
    repo, now: later, retainClosedDays: 365,
  });
  assert.deepEqual([s.unchanged, s.updated, s.created, s.missing], [1, 1, 0, 1]);
  const p1 = await repo.get("1");
  assert.equal(p1?.meta.updatedAt, first?.meta.updatedAt);
  assert.equal(p1?.meta.lastSeenAt, later.toISOString());
  assert.equal((await repo.get("2"))?.title, "공고 2 (정정)");
  assert.equal((await repo.get("3"))?.meta.sourceState, "missing");
  assert.equal(s.closed, 1);

  const s2 = await collect({ client: new FakeClient([item(1), item(2)]), repo, now: new Date("2027-12-01T00:00:00Z"), retainClosedDays: 365 });
  assert.equal(s2.pruned, 1);
  assert.equal(await repo.get("3"), null);
});

test("호출 상한을 넘지 않음", async () => {
  const client = new FakeClient(Array.from({ length: 10 }, (_, i) => item(i + 1)));
  const s = await collect({ client, repo: new MemoryPostingRepository(), now, maxCalls: 4 });
  assert.equal(client.calls, 4);
  assert.equal(s.hitCallLimit, true);
  assert.equal(s.total, 10); // 상세 없이 목록 정보로는 저장
});
