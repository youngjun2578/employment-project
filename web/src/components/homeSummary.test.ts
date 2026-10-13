import assert from "node:assert/strict";
import { test } from "node:test";
import type { StoredPosting } from "@/lib/types";
import { summarize } from "./homeSummary";

const now = new Date("2026-10-14T03:00:00Z"); // KST 2026-10-14(수) 12:00
const mk = (id: string, startDate: string | null, endDate: string | null, firstSeenAt = "2026-10-14T00:00:00Z", inst = "샘플공사 A"): StoredPosting => ({
  id, sourceSn: id, institution: { code: null, name: inst }, title: id, startDate, endDate, regions: [], jobFields: [], hireTypes: [],
  recruitType: null, headcount: null, steps: [], qualification: null, preference: null, disqualification: null, srcUrl: null,
  attachments: [], noAttachmentReason: null,
  meta: { dedupeKey: id, firstSeenAt, lastSeenAt: firstSeenAt, updatedAt: firstSeenAt, contentHash: "", sourceState: "listed" },
});

test("요약 숫자는 데이터에서 계산", () => {
  const s = summarize([
    mk("today", null, "2026-10-14"), // 임박, 이번 주
    mk("sun", null, "2026-10-18", undefined, "샘플공단 B"), // 이번 주(일요일), 진행 중
    mk("nextweek", null, "2026-10-19"), // 다음 주
    mk("closed", null, "2026-10-01"),
    mk("upcoming", "2026-10-16", "2026-10-17"), // 접수 예정은 이번 주 마감에서 제외
    mk("none", null, null),
  ], now);
  assert.equal(s.total, 6);
  assert.equal(s.ongoing, 3);
  assert.equal(s.thisWeek, 2);
  assert.equal(s.weekEnd, "2026-10-18");
  assert.equal(s.upcoming, 1);
  assert.equal(s.institutions, 2);
  assert.deepEqual(s.urgent.map((p) => p.id), ["today"]);
});

test("빈 데이터·0건도 안전", () => {
  const s = summarize([], now);
  assert.deepEqual([s.total, s.ongoing, s.thisWeek, s.upcoming, s.institutions, s.urgent.length, s.fresh], [0, 0, 0, 0, 0, 0, null]);
});

test("새 공고: 수집 이력이 있을 때만", () => {
  // 모두 오늘 처음 수집(첫 수집·샘플) → 섹션 숨김
  assert.equal(summarize([mk("a", null, "2026-10-30"), mk("b", null, "2026-10-30")], now).fresh, null);
  // 이전 수집 이력 + 최근 수집 공고
  const s = summarize([
    mk("old", null, "2026-10-30", "2026-10-01T00:00:00Z"),
    mk("new1", null, "2026-10-30", "2026-10-13T00:00:00Z"),
    mk("new2", null, "2026-10-30", "2026-10-14T01:00:00Z"),
    mk("newClosed", null, "2026-10-10", "2026-10-14T01:00:00Z"),
  ], now);
  assert.deepEqual(s.fresh?.map((p) => p.id), ["new2", "new1"]);
});
