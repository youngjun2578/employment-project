import assert from "node:assert/strict";
import { test } from "node:test";
import { queryPostings } from "./postingQuery";
import type { Posting } from "./types";

const base: Omit<Posting, "id" | "endDate" | "institution" | "jobFields"> = {
  sourceSn: "", title: "t", startDate: null, regions: [], hireTypes: [], recruitType: null, headcount: null,
  steps: [], qualification: null, preference: null, disqualification: null, srcUrl: null, attachments: [], noAttachmentReason: null,
};
const mk = (id: string, endDate: string | null, inst = "샘플공사 A", jobFields: string[] = []): Posting => ({
  ...base, id, endDate, institution: { code: null, name: inst }, jobFields,
});
const now = new Date("2026-10-13T03:00:00Z");

test("마감 임박 순 정렬, 마감은 맨 뒤(최근 마감 먼저), 미정은 그 사이", () => {
  const all = [mk("old", "2026-09-01"), mk("far", "2026-11-30"), mk("none", null), mk("soon", "2026-10-14"), mk("recent", "2026-10-10")];
  assert.deepEqual(queryPostings(all, { now }).map((p) => p.id), ["soon", "far", "none", "recent", "old"]);
});

test("필터: 기관, 직무, 상태", () => {
  const all = [mk("a", "2026-10-14", "샘플공사 A", ["정보통신"]), mk("b", "2026-10-30", "샘플공단 B", ["연구"]), mk("c", "2026-10-01", "샘플공단 B")];
  assert.deepEqual(queryPostings(all, { now, institution: "샘플공단 B" }).map((p) => p.id), ["b", "c"]);
  assert.deepEqual(queryPostings(all, { now, jobField: "정보통신" }).map((p) => p.id), ["a"]);
  assert.deepEqual(queryPostings(all, { now, status: "urgent" }).map((p) => p.id), ["a"]);
  assert.deepEqual(queryPostings(all, { now, status: "active" }).map((p) => p.id), ["a", "b"]);
  assert.deepEqual(queryPostings(all, { now, status: "closed" }).map((p) => p.id), ["c"]);
});
