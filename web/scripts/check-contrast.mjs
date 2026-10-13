// 디자인 토큰 색 대비 검사 (WCAG 2.x). 사용: node scripts/check-contrast.mjs
// 글자/배경 쌍이 기준(본문 4.5, 큰 글자·UI 경계 3.0) 미만이면 종료 코드 1.
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/app/tokens.css", import.meta.url), "utf8");
const tok = Object.fromEntries([...css.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));

const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// [글자, 배경, 최소 대비, 설명]
const PAIRS = [
  ["color-text", "color-bg", 4.5, "본문 / 페이지 배경"],
  ["color-text-2", "color-bg", 4.5, "보조 글자 / 페이지 배경"],
  ["color-text-3", "color-bg", 4.5, "3단계 글자 / 페이지 배경"],
  ["color-text-3", "color-surface", 4.5, "3단계 글자 / 카드"],
  ["color-text-3", "color-surface-muted", 4.5, "3단계 글자 / 흐린 카드(마감)"],
  ["color-primary", "color-surface", 4.5, "링크 / 카드"],
  ["color-primary", "color-bg", 4.5, "링크 / 페이지 배경"],
  ["color-primary-ink", "color-primary", 4.5, "주 버튼 글자"],
  ["color-primary-strong", "color-primary-soft", 4.5, "강조 글자 / 연한 파랑"],
  ["color-primary-ink", "color-header", 4.5, "헤더 글자"],
  ["status-open-fg", "status-open-bg", 4.5, "진행 중 배지"],
  ["status-urgent-fg", "status-urgent-bg", 4.5, "마감 임박 배지"],
  ["status-upcoming-fg", "status-upcoming-bg", 4.5, "접수 예정 배지"],
  ["status-closed-fg", "status-closed-bg", 4.5, "마감 배지"],
  ["status-unknown-fg", "status-unknown-bg", 4.5, "마감일 미정 배지"],
  ["status-urgent-fg", "color-surface", 4.5, "D-day(임박) / 카드"],
  ["status-open-fg", "color-surface", 4.5, "D-day(진행) / 카드"],
  ["color-warn-fg", "color-warn-bg", 4.5, "안내 상자"],
  ["color-border-input", "color-surface", 3, "입력창 경계 / 카드(UI 3:1)"],
  ["color-border-input", "color-bg", 3, "입력창 경계 / 페이지 배경(UI 3:1)"],
  ["color-focus", "color-surface", 3, "포커스 링 / 카드"],
  ["color-focus", "color-bg", 3, "포커스 링 / 페이지 배경"],
];

let fail = 0;
for (const [fg, bg, min, label] of PAIRS) {
  if (!tok[fg] || !tok[bg]) {
    console.log(`?  ${label}: 토큰 없음 (${fg}, ${bg})`);
    fail++;
    continue;
  }
  const r = ratio(tok[fg], tok[bg]);
  const ok = r >= min;
  if (!ok) fail++;
  console.log(`${ok ? "OK" : "NG"} ${r.toFixed(2).padStart(5)}:1 (기준 ${min}) ${label}  ${tok[fg]} / ${tok[bg]}`);
}

// 기관 이니셜 아이콘 팔레트(InstitutionAvatar.tsx 와 같아야 함): 흰 글자 대비
const AVATAR = ["#1d4ed8", "#0f766e", "#7c3aed", "#b45309", "#be185d", "#4338ca", "#047857", "#9a3412", "#0e7490", "#475569"];
for (const c of AVATAR) {
  const r = ratio("#ffffff", c);
  if (r < 4.5) fail++;
  console.log(`${r >= 4.5 ? "OK" : "NG"} ${r.toFixed(2).padStart(5)}:1 (기준 4.5) 이니셜 아이콘 흰 글자 / ${c}`);
}
process.exit(fail ? 1 : 0);
