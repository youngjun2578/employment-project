import { dDayLabel, deadlineStatus } from "@/lib/dates";
import type { DeadlineStatus } from "@/lib/types";

const LABEL: Record<DeadlineStatus, string> = {
  upcoming: "접수예정",
  open: "접수중",
  urgent: "마감임박",
  closed: "마감",
  unknown: "마감일 미정",
};

export function StatusBadge({ startDate, endDate, now }: { startDate: string | null; endDate: string | null; now?: Date }) {
  const s = deadlineStatus(startDate, endDate, now);
  return <span className={`badge badge-${s}`}>{LABEL[s]}</span>;
}

export function DDay({ endDate, now }: { endDate: string | null; now?: Date }) {
  const s = deadlineStatus(null, endDate, now);
  const label = dDayLabel(endDate, now);
  if (s === "closed" || s === "unknown") return null;
  return <span className="dday" style={{ color: s === "urgent" ? "var(--urgent)" : "var(--navy-700)" }}>{label}</span>;
}

export const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "active", label: "마감 전 전체" },
  { value: "urgent", label: "마감임박(D-3 이내)" },
  { value: "open", label: "접수중" },
  { value: "upcoming", label: "접수예정" },
  { value: "closed", label: "마감" },
  { value: "all", label: "전체(마감 포함)" },
];
