import { daysLeft, deadlineStatus, todayKst } from "@/lib/dates";
import type { StoredPosting } from "@/lib/types";

/** 첫 화면 요약 숫자. 모두 저장소 데이터에서 계산한다(하드코딩 없음) */
export interface HomeSummary {
  total: number;
  /** 접수 중(진행 중 + 마감 임박) */
  ongoing: number;
  /** 오늘부터 이번 주 일요일(KST)까지 마감 */
  thisWeek: number;
  weekEnd: string;
  upcoming: number;
  /** 접수 중 공고가 있는 기관 수 */
  institutions: number;
  urgent: StoredPosting[];
  /** 최근 NEW_DAYS 일 안에 처음 수집된 공고. 수집 이력이 없으면 null(섹션 숨김) */
  fresh: StoredPosting[] | null;
}

export const NEW_DAYS = 3;

export function summarize(all: StoredPosting[], now: Date): HomeSummary {
  const today = todayKst(now);
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = 일요일
  const toSunday = (7 - dow) % 7;
  const weekEnd = new Date(Date.parse(`${today}T00:00:00Z`) + toSunday * 86_400_000).toISOString().slice(0, 10);

  let ongoing = 0, thisWeek = 0, upcoming = 0;
  const inst = new Set<string>();
  const urgent: StoredPosting[] = [];
  for (const p of all) {
    const s = deadlineStatus(p.startDate, p.endDate, now);
    if (s === "open" || s === "urgent") {
      ongoing++;
      inst.add(p.institution.code ?? p.institution.name);
    }
    if (s === "upcoming") upcoming++;
    if (s === "urgent") urgent.push(p);
    const left = daysLeft(p.endDate, now);
    if (left !== null && left >= 0 && left <= toSunday && s !== "upcoming") thisWeek++;
  }
  urgent.sort((a, b) => (daysLeft(a.endDate, now) ?? 0) - (daysLeft(b.endDate, now) ?? 0));

  return {
    total: all.length, ongoing, thisWeek, weekEnd, upcoming, institutions: inst.size,
    urgent: urgent.slice(0, 5),
    fresh: freshPostings(all, now),
  };
}

/**
 * meta.firstSeenAt(수집기가 처음 본 시각) 기준 새 공고.
 * 가장 이른 수집 시각이 기준 기간 안이면 "처음 수집한 날"이라 모든 공고가 새 공고가 되므로 null.
 * (공고 게시일·등록일이 아니라 이 사이트가 처음 수집한 시각이라는 점에 주의)
 */
function freshPostings(all: StoredPosting[], now: Date): StoredPosting[] | null {
  const times = all.map((p) => Date.parse(p.meta?.firstSeenAt ?? "")).filter(Number.isFinite);
  if (times.length === 0) return null;
  const cutoff = now.getTime() - NEW_DAYS * 86_400_000;
  if (Math.min(...times) >= cutoff) return null;
  return all
    .filter((p) => Date.parse(p.meta.firstSeenAt) >= cutoff && deadlineStatus(p.startDate, p.endDate, now) !== "closed")
    .sort((a, b) => Date.parse(b.meta.firstSeenAt) - Date.parse(a.meta.firstSeenAt))
    .slice(0, 5);
}
