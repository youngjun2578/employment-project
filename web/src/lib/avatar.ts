/**
 * 기관 이니셜 아이콘 (실제 로고 대신). 화면 표시 전용 계산이며 데이터에는 영향이 없다.
 * 색 팔레트는 scripts/check-contrast.mjs 의 AVATAR 와 같아야 한다(흰 글자 4.5:1 이상 검증).
 */
export const AVATAR_COLORS = [
  "#1d4ed8", "#0f766e", "#7c3aed", "#b45309", "#be185d",
  "#4338ca", "#047857", "#9a3412", "#0e7490", "#475569",
] as const;

/** 기관명 앞에 붙는 법인 형태·표기는 건너뛴다 */
const PREFIX = /^(?:\s|\(재\)|\(사\)|\(주\)|\(의\)|\(학\)|㈜|재단법인|사단법인|주식회사|\[[^\]]*\]|【[^】]*】|[\p{P}\p{S}])+/u;

export function institutionInitial(name: string): string {
  const trimmed = name.normalize("NFC").replace(PREFIX, "");
  const ch = [...(trimmed || name.trim())][0] ?? "?";
  return /\p{L}/u.test(ch) ? ch.toUpperCase() : /\d/.test(ch) ? ch : "?";
}

/** FNV-1a 32bit: 같은 기관명은 항상 같은 색 */
export function institutionColor(name: string): string {
  let h = 0x811c9dc5;
  for (const c of name.normalize("NFC")) {
    h ^= c.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
