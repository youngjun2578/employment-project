/** 화면 표시용 날짜 형식 (데이터 계산에는 쓰지 않음) */
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

/** "2026-10-25" → "10.25(일)" */
export function shortDate(iso: string | null): string {
  if (!iso) return "미정";
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "미정";
  return `${iso.slice(5, 7)}.${iso.slice(8, 10)}(${WEEKDAY[d.getUTCDay()]})`;
}

/** 칩에 보여줄 앞쪽 항목과 나머지 개수 */
export function headAndRest<T>(items: T[], n: number): { head: T[]; rest: number } {
  return { head: items.slice(0, n), rest: Math.max(0, items.length - n) };
}
