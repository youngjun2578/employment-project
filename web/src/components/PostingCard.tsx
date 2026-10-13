import Link from "next/link";
import { deadlineStatus, formatDate } from "@/lib/dates";
import type { Posting } from "@/lib/types";
import { DDay, StatusBadge } from "./StatusBadge";

export function PostingCard({ p, now }: { p: Posting; now: Date }) {
  const closed = deadlineStatus(p.startDate, p.endDate, now) === "closed";
  return (
    <Link href={`/postings/${encodeURIComponent(p.id)}`} className={`posting-card${closed ? " is-closed" : ""}`}>
      <div className="top">
        <StatusBadge startDate={p.startDate} endDate={p.endDate} now={now} />
        <span className="inst">{p.institution.name}</span>
        <DDay endDate={p.endDate} now={now} />
      </div>
      <h2>{p.title}</h2>
      <div className="meta">
        <span>접수 {formatDate(p.startDate)} ~ {formatDate(p.endDate)}</span>
        {p.regions.length > 0 && <span>근무지 {p.regions.join(", ")}</span>}
        {p.hireTypes.length > 0 && <span>{p.hireTypes.join(", ")}</span>}
        {p.headcount ? <span>{p.headcount}명</span> : null}
      </div>
    </Link>
  );
}
