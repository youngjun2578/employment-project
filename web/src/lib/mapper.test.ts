import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanText, parseHeadcount, splitList, toPosting, unwrapDetail, unwrapList } from "./mapper";
import { daysLeft, deadlineStatus, parseYmd } from "./dates";

test("parseYmd: 여러 형식과 잘못된 값", () => {
  assert.equal(parseYmd("20261013"), "2026-10-13");
  assert.equal(parseYmd(20261013), "2026-10-13");
  assert.equal(parseYmd("2026.10.13"), "2026-10-13");
  assert.equal(parseYmd("202610131800"), "2026-10-13");
  assert.equal(parseYmd("20260230"), null);
  assert.equal(parseYmd(""), null);
  assert.equal(parseYmd(undefined), null);
  assert.equal(parseYmd("abc"), null);
});

test("deadlineStatus: KST 기준", () => {
  const now = new Date("2026-10-13T03:00:00Z"); // KST 12:00
  assert.equal(deadlineStatus(null, "2026-10-12", now), "closed");
  assert.equal(deadlineStatus(null, "2026-10-13", now), "urgent");
  assert.equal(deadlineStatus(null, "2026-10-16", now), "urgent");
  assert.equal(deadlineStatus(null, "2026-10-17", now), "open");
  assert.equal(deadlineStatus("2026-10-20", "2026-10-30", now), "upcoming");
  assert.equal(deadlineStatus(null, null, now), "unknown");
  // UTC 로는 13일 15시지만 KST 로는 14일 0시 → 13일 마감 공고는 마감
  assert.equal(daysLeft("2026-10-13", new Date("2026-10-13T15:00:00Z")), -1);
});

test("빈 응답·필드 누락에도 깨지지 않음", () => {
  assert.equal(toPosting(null), null);
  assert.equal(toPosting({}), null);
  const p = toPosting({ recrutPblntSn: 1 });
  assert.ok(p);
  assert.equal(p.title, "(제목 없음)");
  assert.equal(p.institution.name, "기관명 미상");
  assert.deepEqual(p.attachments, []);
  assert.equal(p.srcUrl, null);
  assert.equal(p.endDate, null);
  assert.deepEqual(unwrapList(null), { items: [], totalCount: null });
  assert.deepEqual(unwrapList({ result: "x" }).items, []);
  assert.equal(unwrapDetail("x"), null);
});

test("상세가 목록 값을 덮되 빈 값은 덮지 않음", () => {
  const p = toPosting(
    { recrutPblntSn: "9", recrutPbancTtl: "목록 제목", instNm: "샘플공사 A", srcUrl: "https://example.org/a" },
    { recrutPbancTtl: "상세 제목", srcUrl: "" },
  );
  assert.equal(p?.title, "상세 제목");
  assert.equal(p?.srcUrl, "https://example.org/a");
});

test("srcUrl: http(s) 만 인정", () => {
  for (const bad of ["", "#", "javascript:alert(1)", "www.example.org", " "]) {
    assert.equal(toPosting({ recrutPblntSn: 1, srcUrl: bad })?.srcUrl, null, bad);
  }
});

test("첨부: 유형·확장자·정렬·viewUrl", () => {
  const p = toPosting({
    recrutPblntSn: "77",
    files: [
      { atchType: "B", atchFileNm: "지원서.HWP", url: "/file/2", sortNo: 2 },
      { atchType: "A", atchFileNm: "공고문.pdf", url: "https://example.org/f/1", sortNo: 1 },
      { atchType: "Q", atchFileNm: "noext", url: "" },
      null,
    ],
  });
  assert.ok(p);
  assert.deepEqual(p.attachments.map((a) => [a.type, a.extension]), [["A", "pdf"], ["B", "hwp"], ["Z", ""]]);
  assert.equal(p.attachments[0].viewUrl, "/api/attachments/77/0");
  assert.equal(p.attachments[1].sourceUrl, "/file/2");
  assert.equal(p.attachments[2].viewUrl, null);
});

test("목록·텍스트·인원 파서", () => {
  assert.deepEqual(splitList("서울,경기, 서울"), ["서울", "경기"]);
  assert.deepEqual(splitList(["정규직", "", null]), ["정규직"]);
  assert.equal(parseHeadcount("1,200명"), 1200);
  assert.equal(parseHeadcount("0명"), 0);
  assert.equal(parseHeadcount("미정"), null);
  assert.equal(cleanText("<p>가&amp;나</p><br/>다"), "가&나\n\n다");
});

test("전형절차: 배열/텍스트 둘 다", () => {
  assert.deepEqual(toPosting({ recrutPblntSn: 1, steps: [{ recrutPbancStepNm: "서류" }, "면접"] })?.steps, ["서류", "면접"]);
  assert.deepEqual(toPosting({ recrutPblntSn: 1, scrnprcdrMthdExpln: "서류전형 → 필기전형 → 면접전형" })?.steps, ["서류전형", "필기전형", "면접전형"]);
});
