import type { DeadlineStatus } from "./types";

/** 마감 임박 기준(일). 오늘 포함 D-3 이내 */
export const URGENT_DAYS = 3;

/**
 * "20261013", "2026-10-13", "2026.10.13", "20261013235959" 등을 "2026-10-13" 으로.
 * 형식이 맞지 않거나 존재하지 않는 날짜면 null.
 */
export function parseYmd(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const digits = String(value).trim().replace(/[^0-9]/g, "");
  if (digits.length < 8) return null;
  const y = Number(digits.slice(0, 4));
  const m = Number(digits.slice(4, 6));
  const d = Number(digits.slice(6, 8));
  if (y < 1900 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null; // 2월 30일 같은 값 거르기
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

/** 한국 시간 기준 오늘 날짜(YYYY-MM-DD) */
export function todayKst(now: Date = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function dayNumber(iso: string): number {
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
}

/** 마감일까지 남은 일수(오늘 마감 = 0, 지남 = 음수). 마감일 없으면 null */
export function daysLeft(endDate: string | null, now: Date = new Date()): number | null {
  if (!endDate) return null;
  return dayNumber(endDate) - dayNumber(todayKst(now));
}

export function deadlineStatus(
  startDate: string | null,
  endDate: string | null,
  now: Date = new Date(),
): DeadlineStatus {
  const left = daysLeft(endDate, now);
  if (left === null) return "unknown";
  if (left < 0) return "closed";
  if (startDate && dayNumber(startDate) > dayNumber(todayKst(now))) return "upcoming";
  return left <= URGENT_DAYS ? "urgent" : "open";
}

export function formatDate(iso: string | null): string {
  return iso ? iso.replaceAll("-", ".") : "미정";
}

export function dDayLabel(endDate: string | null, now: Date = new Date()): string {
  const left = daysLeft(endDate, now);
  if (left === null) return "마감일 미정";
  if (left < 0) return "마감";
  if (left === 0) return "오늘 마감";
  return `D-${left}`;
}
