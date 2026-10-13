import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { AVATAR_COLORS, institutionColor, institutionInitial } from "./avatar";

test("이니셜: 한글·영문·숫자·접두어", () => {
  assert.equal(institutionInitial("샘플공사 A"), "샘");
  assert.equal(institutionInitial("(재)샘플재단"), "샘");
  assert.equal(institutionInitial("[샘플] 한국가상공단"), "한");
  assert.equal(institutionInitial("재단법인 가상진흥원"), "가");
  assert.equal(institutionInitial("k-샘플원"), "K");
  assert.equal(institutionInitial("3D샘플공사"), "3");
  assert.equal(institutionInitial("  "), "?");
  assert.equal(institutionInitial("★"), "?");
});

test("색: 같은 이름은 같은 색, 팔레트 안의 값", () => {
  assert.equal(institutionColor("샘플공사 A"), institutionColor("샘플공사 A"));
  assert.ok((AVATAR_COLORS as readonly string[]).includes(institutionColor("아무 기관")));
  const spread = new Set(["샘플공사 A", "샘플공단 B", "샘플진흥원 C", "샘플재단 D", "샘플공사 E"].map(institutionColor));
  assert.ok(spread.size >= 3, "기관마다 색이 어느 정도 나뉘어야 함");
});

test("팔레트가 대비 검사 스크립트와 같음", () => {
  const script = readFileSync("scripts/check-contrast.mjs", "utf8");
  for (const c of AVATAR_COLORS) assert.ok(script.includes(c), c);
});
