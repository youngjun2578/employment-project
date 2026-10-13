import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveView } from "./attachments";

const conv = (o: Record<string, unknown>) => ({ status: "success", viewFormat: "pdf", viewUrl: "/files/a.pdf", reason: null, ...o });

test("resolveView: 변환 결과 우선, 없으면 확장자 기준", () => {
  assert.deepEqual(resolveView({ extension: "hwp", viewUrl: "/api/attachments/1/0", conversion: conv({}) }), { kind: "pdf", url: "/files/a.pdf", fallback: null, reason: null });
  assert.equal(resolveView({ extension: "hwp", viewUrl: "/x", conversion: conv({ status: "failed", viewUrl: null, reason: "실패" }) }).fallback, "converting");
  assert.equal(resolveView({ extension: "zip", viewUrl: "/x", conversion: conv({ status: "unsupported", viewUrl: null }) }).fallback, "unsupported");
  assert.deepEqual(resolveView({ extension: "pdf", viewUrl: "/api/attachments/1/0" }), { kind: "pdf", url: "/api/attachments/1/0", fallback: null, reason: null });
  assert.equal(resolveView({ extension: "hwp", viewUrl: "/api/attachments/1/0" }).fallback, "converting");
  assert.equal(resolveView({ extension: "png", viewUrl: null }).kind, "unsupported");
});
