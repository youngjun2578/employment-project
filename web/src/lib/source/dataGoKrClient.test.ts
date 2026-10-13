import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, beforeEach, describe, test } from "node:test";
import { collect } from "../collector/pipeline";
import { toPosting, unwrapList } from "../mapper";
import { MemoryPostingRepository } from "../repository/memoryRepository";
import { CallBudget, DataGoKrApiError, DataGoKrRecruitClient, MissingServiceKeyError, parseBody, redactKey } from "./dataGoKrClient";

/** 실제 외부 호출 없이 node:http 모의 서버로만 시험한다 */
const KEY = "TEST+key/with==special&chars";
type Handler = (url: URL, req: IncomingMessage, res: ServerResponse) => void;

let server: Server;
let base = "";
let handler: Handler = () => {};
const seen: URL[] = [];

before(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    seen.push(url);
    handler(url, req, res);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/1051000/recruitment`;
});
after(() => new Promise<void>((r) => server.close(() => r())));
beforeEach(() => {
  seen.length = 0;
});

const json = (res: ServerResponse, body: unknown, status = 200) => {
  res.writeHead(status, { "Content-Type": "application/json;charset=UTF-8" });
  res.end(JSON.stringify(body));
};
const xml = (res: ServerResponse, code: string, auth: string, status = 200) => {
  res.writeHead(status, { "Content-Type": "text/xml;charset=UTF-8" });
  res.end(`<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg><returnAuthMsg>${auth}</returnAuthMsg><returnReasonCode>${code}</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>`);
};

const ITEMS = Array.from({ length: 5 }, (_, i) => ({
  recrutPblntSn: 1000 + i, instNm: `샘플기관 ${i}`, recrutPbancTtl: `공고 ${i}`, pbancBgngYmd: "20261001", pbancEndYmd: "20261030",
}));

/** 목록·상세를 흉내 내는 정상 서버 */
const okServer: Handler = (url, _req, res) => {
  if (url.pathname.endsWith("/list")) {
    const page = Number(url.searchParams.get("pageNo"));
    const rows = Number(url.searchParams.get("numOfRows"));
    return json(res, { resultCode: 200, resultMsg: "성공했습니다.", totalCount: ITEMS.length, result: ITEMS.slice((page - 1) * rows, page * rows) });
  }
  if (url.pathname.endsWith("/detail")) {
    const it = ITEMS.find((x) => String(x.recrutPblntSn) === url.searchParams.get("sn"));
    return json(res, { resultCode: 200, resultMsg: "성공했습니다.", result: it ? { ...it, aplyQlfcCn: "자격" } : null });
  }
  res.writeHead(404).end();
};

const client = (o: Partial<ConstructorParameters<typeof DataGoKrRecruitClient>[0]> = {}) =>
  new DataGoKrRecruitClient({ key: KEY, baseUrl: base, retryBaseMs: 1, sleep: async () => {}, ...o });

describe("정상 응답", () => {
  test("목록: 페이지네이션·진행중 필터·resultType·serviceKey 파라미터", async () => {
    handler = okServer;
    const body = await client().fetchList({ pageNo: 2, numOfRows: 2, ongoingOnly: true });
    const q = seen[0].searchParams;
    assert.equal(seen[0].pathname, "/1051000/recruitment/list");
    assert.equal(q.get("serviceKey"), KEY); // 특수문자도 정확히 인코딩되어 전달
    assert.equal(q.get("resultType"), "json");
    assert.equal(q.get("pageNo"), "2");
    assert.equal(q.get("numOfRows"), "2");
    assert.equal(q.get("ongoingYn"), "Y");
    assert.deepEqual(unwrapList(body).items.map((i) => i.recrutPblntSn), [1002, 1003]);
  });

  test("numOfRows 는 최대 100으로 자르고, ongoingOnly 가 아니면 필터를 보내지 않음", async () => {
    handler = okServer;
    await client().fetchList({ pageNo: 1, numOfRows: 500 });
    assert.equal(seen[0].searchParams.get("numOfRows"), "100");
    assert.equal(seen[0].searchParams.has("ongoingYn"), false);
  });

  test("빈 결과와 마지막 페이지", async () => {
    handler = okServer;
    const last = unwrapList(await client().fetchList({ pageNo: 3, numOfRows: 2 }));
    assert.deepEqual(last.items.map((i) => i.recrutPblntSn), [1004]);
    assert.equal(last.totalCount, 5);
    const empty = unwrapList(await client().fetchList({ pageNo: 9, numOfRows: 2 }));
    assert.deepEqual(empty.items, []);
    handler = (_u, _q, res) => json(res, { resultCode: 200, resultMsg: "성공", totalCount: 0, result: [] });
    assert.deepEqual(unwrapList(await client().fetchList({ pageNo: 1, numOfRows: 10 })), { items: [], totalCount: 0 });
  });

  test("상세: sn 파라미터, 없는 공고는 null", async () => {
    handler = okServer;
    const d = (await client().fetchDetail("1001")) as { result: { aplyQlfcCn: string } };
    assert.equal(seen[0].searchParams.get("sn"), "1001");
    assert.equal(d.result.aplyQlfcCn, "자격");
    assert.equal(await client().fetchDetail("9999"), null);
    assert.equal(await client().fetchDetail("../x"), null); // 이상한 값은 호출하지 않음
  });

  test("필드 일부가 없는 응답도 수집 흐름이 깨지지 않음", async () => {
    handler = (url, _q, res) =>
      url.pathname.endsWith("/list")
        ? json(res, { resultCode: 200, result: [{ recrutPblntSn: 1 }, { instNm: "번호 없음" }, { recrutPblntSn: 2, pbancEndYmd: "잘못된날짜", srcUrl: "http://," }] })
        : json(res, { resultCode: 200 });
    const repo = new MemoryPostingRepository();
    const s = await collect({ client: client(), repo, now: new Date("2026-10-13T00:00:00Z") });
    assert.equal(s.created, 2);
    assert.equal(s.skippedInvalid, 1);
    const p2 = await repo.get("2");
    assert.equal(p2?.endDate, null);
    assert.equal(p2?.srcUrl, null);
    assert.equal(toPosting({ recrutPblntSn: 3 })?.title, "(제목 없음)");
  });
});

describe("오류 처리", () => {
  test("상세에서 인증 오류가 나면 수집 전체를 멈추고 저장하지 않음(한도 낭비 방지)", async () => {
    handler = (url, q, res) => (url.pathname.endsWith("/detail") ? xml(res, "30", "SERVICE_KEY_IS_NOT_REGISTERED_ERROR") : okServer(url, q, res));
    const repo = new MemoryPostingRepository();
    await assert.rejects(collect({ client: client(), repo }), /등록되지 않은 서비스키/);
    assert.equal(seen.length, 2); // 목록 1 + 상세 1 에서 멈춤
    assert.deepEqual(await repo.list(), []);
  });

  test("HTTP 200 + XML 오류 봉투(키 미등록) → 한국어 메시지, 재시도 안 함, 키 노출 없음", async () => {
    handler = (_u, _q, res) => xml(res, "30", "SERVICE_KEY_IS_NOT_REGISTERED_ERROR");
    await assert.rejects(client().fetchList({ pageNo: 1, numOfRows: 10 }), (e: unknown) => {
      assert.ok(e instanceof DataGoKrApiError);
      assert.equal(e.kind, "auth");
      assert.equal(e.code, "30");
      assert.match(e.message, /등록되지 않은 서비스키/);
      assert.ok(!e.message.includes(KEY) && !String(e.stack).includes(KEY));
      assert.ok(!String(e.stack).includes(encodeURIComponent(KEY)));
      return true;
    });
    assert.equal(seen.length, 1);
  });

  test("만료 키(31)·IP 미등록(32)·코드 없이 메시지만 온 경우", async () => {
    handler = (_u, _q, res) => xml(res, "31", "DEADLINE_HAS_EXPIRED_ERROR");
    await assert.rejects(client().fetchList({ pageNo: 1, numOfRows: 1 }), /활용기간이 만료/);
    handler = (_u, _q, res) => xml(res, "32", "UNREGISTERED_IP_ERROR");
    await assert.rejects(client().fetchList({ pageNo: 1, numOfRows: 1 }), /등록되지 않은 IP/);
    assert.throws(() => parseBody("<r><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg></r>", 200), /등록되지 않은 서비스키/);
  });

  test("HTTP 403 + JSON 게이트웨이 오류(공개 사례 형태)", async () => {
    handler = (_u, _q, res) => json(res, { errMsg: "SERVICE ERROR", returnAuthMsg: "SERVICE_KEY_IS_NOT_REGISTERED_ERROR", returnReasonCode: "30" }, 403);
    await assert.rejects(client().fetchList({ pageNo: 1, numOfRows: 1 }), (e: unknown) => e instanceof DataGoKrApiError && e.kind === "auth" && e.httpStatus === 403);
  });

  test("트래픽 초과(22) → 재시도 없이 중단", async () => {
    handler = (_u, _q, res) => xml(res, "22", "LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR");
    await assert.rejects(client().fetchList({ pageNo: 1, numOfRows: 1 }), (e: unknown) => e instanceof DataGoKrApiError && e.kind === "quota" && /트래픽 한도/.test(e.message));
    assert.equal(seen.length, 1);
    handler = (_u, _q, res) => res.writeHead(429).end();
    await assert.rejects(client().fetchList({ pageNo: 1, numOfRows: 1 }), /트래픽 한도/);
  });

  test("5xx 후 재시도 성공 (지수 백오프)", async () => {
    let n = 0;
    handler = (u, q, res) => (++n <= 2 ? res.writeHead(503).end("Service Unavailable") : okServer(u, q, res));
    const waits: number[] = [];
    const body = await client({ retryBaseMs: 100, sleep: async (ms) => void waits.push(ms) }).fetchList({ pageNo: 1, numOfRows: 2 });
    assert.equal(unwrapList(body).items.length, 2);
    assert.deepEqual(waits, [100, 200]);
    assert.equal(seen.length, 3);
  });

  test("5xx 가 계속되면 재시도 횟수 제한 후 실패", async () => {
    handler = (_u, _q, res) => res.writeHead(500).end();
    await assert.rejects(client({ maxRetries: 2 }).fetchList({ pageNo: 1, numOfRows: 1 }), (e: unknown) => e instanceof DataGoKrApiError && e.kind === "server");
    assert.equal(seen.length, 3);
  });

  test("JSON resultCode 오류·깨진 본문·XML 정상 응답", () => {
    assert.throws(() => parseBody(JSON.stringify({ resultCode: 500, resultMsg: "내부 오류" }), 200), /API 오류\(500\): 내부 오류/);
    assert.throws(() => parseBody(JSON.stringify({ response: { header: { resultCode: "03", resultMsg: "NODATA_ERROR" } } }), 200), /NODATA_ERROR/);
    assert.throws(() => parseBody("not json", 200), (e: unknown) => e instanceof DataGoKrApiError && e.kind === "parse");
    assert.throws(() => parseBody("<response><header><resultCode>00</resultCode></header></response>", 200), /XML 응답/);
  });
});

describe("호출 상한·키 보호", () => {
  test("일일 상한을 넘으면 호출하지 않고 중단 (재시도도 집계)", async () => {
    let n = 0;
    handler = (u, q, res) => (++n === 1 ? res.writeHead(502).end() : okServer(u, q, res));
    const c = client({ budget: new CallBudget(2) });
    await c.fetchList({ pageNo: 1, numOfRows: 1 }); // 502 + 재시도 = 2건
    await assert.rejects(c.fetchList({ pageNo: 1, numOfRows: 1 }), (e: unknown) => e instanceof DataGoKrApiError && e.kind === "limit");
    assert.equal(seen.length, 2);
  });

  test("상한은 파일로 실행 간 누적, 날짜(KST)가 바뀌면 초기화", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "budget-"));
    try {
      const file = path.join(dir, "usage.json");
      let now = new Date("2026-10-13T14:00:00Z"); // KST 23시
      await new CallBudget(2, file, () => now).consume();
      const b2 = new CallBudget(2, file, () => now);
      await b2.consume();
      await assert.rejects(b2.consume(), /호출 상한/);
      now = new Date("2026-10-13T15:30:00Z"); // KST 다음날 00:30
      await b2.consume();
      assert.equal(b2.usedToday, 1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("키 없으면 생성 단계에서 안내 오류, 로그·직렬화에 키가 남지 않음", async () => {
    const prev = process.env.DATA_GO_KR_KEY;
    delete process.env.DATA_GO_KR_KEY;
    try {
      assert.throws(() => new DataGoKrRecruitClient(), MissingServiceKeyError);
    } finally {
      if (prev !== undefined) process.env.DATA_GO_KR_KEY = prev;
    }
    handler = okServer;
    const logs: string[] = [];
    const c = client({ log: (m) => logs.push(m) });
    await c.fetchList({ pageNo: 1, numOfRows: 1 });
    assert.ok(logs.length > 0 && logs.every((l) => l.includes("serviceKey=***") && !l.includes(KEY) && !l.includes(encodeURIComponent(KEY))));
    assert.ok(!JSON.stringify(c).includes(KEY));
    assert.equal(redactKey(`https://x/?serviceKey=${encodeURIComponent(KEY)}&a=1`, KEY), "https://x/?serviceKey=***&a=1");
  });

  test("네트워크 오류(연결 거부)도 재시도 후 키 없이 실패", async () => {
    const c = new DataGoKrRecruitClient({ key: KEY, baseUrl: "http://127.0.0.1:1/x", retryBaseMs: 1, sleep: async () => {}, maxRetries: 1 });
    await assert.rejects(c.fetchList({ pageNo: 1, numOfRows: 1 }), (e: unknown) => {
      assert.ok(e instanceof DataGoKrApiError && e.kind === "network");
      assert.ok(!String(e.stack).includes(KEY));
      return true;
    });
  });
});
