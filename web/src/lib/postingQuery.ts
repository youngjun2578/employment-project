import { daysLeft, deadlineStatus } from "./dates";
import type { Posting, PostingFilter } from "./types";

export function matchesFilter(p: Posting, f: PostingFilter = {}): boolean {
  const now = f.now ?? new Date();
  if (f.institution && p.institution.name !== f.institution) return false;
  if (f.jobField && !p.jobFields.includes(f.jobField)) return false;
  if (f.status) {
    const s = deadlineStatus(p.startDate, p.endDate, now);
    if (f.status === "active") {
      if (s === "closed") return false;
    } else if (s !== f.status) {
      return false;
    }
  }
  return true;
}

/**
 * 마감 임박 순: 마감 전 공고를 남은 일수 오름차순(마감일 미정은 그 뒤),
 * 마감된 공고는 맨 뒤에 최근 마감 순.
 */
export function compareByDeadline(a: Posting, b: Posting, now: Date = new Date()): number {
  const da = daysLeft(a.endDate, now);
  const db = daysLeft(b.endDate, now);
  const rank = (d: number | null) => (d === null ? 1 : d < 0 ? 2 : 0);
  const ra = rank(da);
  const rb = rank(db);
  if (ra !== rb) return ra - rb;
  if (da === null || db === null) return a.title.localeCompare(b.title, "ko");
  if (ra === 2) return db - da; // 마감: 최근 마감이 위
  return da - db || a.title.localeCompare(b.title, "ko");
}

export function queryPostings<T extends Posting>(all: T[], f: PostingFilter = {}): T[] {
  const now = f.now ?? new Date();
  return all.filter((p) => matchesFilter(p, { ...f, now })).sort((a, b) => compareByDeadline(a, b, now));
}

export function filterOptions(all: Posting[]): { institutions: string[]; jobFields: string[] } {
  const inst = new Set<string>();
  const jobs = new Set<string>();
  for (const p of all) {
    inst.add(p.institution.name);
    p.jobFields.forEach((j) => jobs.add(j));
  }
  const ko = (a: string, b: string) => a.localeCompare(b, "ko");
  return { institutions: [...inst].sort(ko), jobFields: [...jobs].sort(ko) };
}
