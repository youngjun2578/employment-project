/** 목록 쿼리 문자열 조립 (화면용). 빈 값은 뺀다 */
export interface ListParams {
  q: string;
  inst: string;
  job: string;
  status: string;
}

export function listHref(cur: ListParams, patch: Partial<ListParams> = {}): string {
  const next = { ...cur, ...patch };
  const sp = new URLSearchParams();
  if (next.q) sp.set("q", next.q);
  if (next.inst) sp.set("inst", next.inst);
  if (next.job) sp.set("job", next.job);
  if (next.status && next.status !== "all") sp.set("status", next.status);
  const s = sp.toString();
  return s ? `/?${s}#list` : "/#list";
}
