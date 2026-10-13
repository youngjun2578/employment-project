import { dDayLabel, deadlineStatus } from "@/lib/dates";
import type { DeadlineStatus } from "@/lib/types";

/** 마감 상태 라벨. 색(tokens.css 의 --status-*)과 함께 항상 글자로도 표시한다 */
export const STATUS_LABEL: Record<DeadlineStatus, string> = {
  upcoming: "접수 예정",
  open: "진행 중",
  urgent: "마감 임박",
  closed: "마감",
  unknown: "마감일 미정",
};

export function StatusBadge({ startDate, endDate, now }: { startDate: string | null; endDate: string | null; now?: Date }) {
  const s = deadlineStatus(startDate, endDate, now);
  return <span className={`badge badge-${s}`}>{STATUS_LABEL[s]}</span>;
}

export function DDay({ endDate, now }: { endDate: string | null; now?: Date }) {
  const s = deadlineStatus(null, endDate, now);
  const label = dDayLabel(endDate, now);
  if (s === "closed" || s === "unknown") return null;
  return <span className={`dday dday-${s}`}>{label}</span>;
}

export const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "active", label: "마감 전 전체" },
  { value: "urgent", label: "마감 임박(D-3 이내)" },
  { value: "open", label: "진행 중" },
  { value: "upcoming", label: "접수 예정" },
  { value: "closed", label: "마감" },
  { value: "all", label: "전체(마감 포함)" },
];
