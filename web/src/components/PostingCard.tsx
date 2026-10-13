import Link from "next/link";
import { dDayLabel, deadlineStatus } from "@/lib/dates";
import type { Posting } from "@/lib/types";
import { headAndRest, shortDate } from "./format";
import { InstitutionAvatar } from "./InstitutionAvatar";
import { StatusBadge } from "./StatusBadge";

/**
 * 공고 카드: 기관 아이콘·기관명·상태 / 제목(2줄) / 직무·근무지 칩 / 마감일·D-day
 * variant="compact" 는 첫 화면 마감 임박 가로 목록용(칩 생략)
 */
export function PostingCard({ p, now, variant = "full", headingLevel = 3 }: {
  p: Posting;
  now: Date;
  variant?: "full" | "compact";
  headingLevel?: 2 | 3;
}) {
  const status = deadlineStatus(p.startDate, p.endDate, now);
  const closed = status === "closed";
  const jobs = headAndRest(p.jobFields, 2);
  const regions = headAndRest(p.regions, 2);
  const Title = headingLevel === 2 ? "h2" : "h3";

  return (
    <Link href={`/postings/${encodeURIComponent(p.id)}`} className={`pcard pcard-${variant}${closed ? " is-closed" : ""}`}>
      <div className="pcard-top">
        <InstitutionAvatar name={p.institution.name} size="sm" muted={closed} />
        <span className="pcard-inst">{p.institution.name}</span>
        <StatusBadge startDate={p.startDate} endDate={p.endDate} now={now} />
      </div>

      <Title className="pcard-title">{p.title}</Title>

      {variant === "full" && (jobs.head.length > 0 || regions.head.length > 0) && (
        <ul className="pcard-chips" aria-label="직무·근무지">
          {jobs.head.map((j) => <li key={`j-${j}`} className="chip">{j}</li>)}
          {jobs.rest > 0 && <li className="chip chip-more">직무 +{jobs.rest}</li>}
          {regions.head.map((r) => <li key={`r-${r}`} className="chip chip-region">{r}</li>)}
          {regions.rest > 0 && <li className="chip chip-more">지역 +{regions.rest}</li>}
        </ul>
      )}

      <div className="pcard-foot">
        <span className="pcard-date">
          {status === "upcoming" && p.startDate
            ? <>접수 시작 <strong>{shortDate(p.startDate)}</strong></>
            : p.endDate
              ? <>마감 <strong>{shortDate(p.endDate)}</strong></>
              : <>마감일 정보 없음</>}
        </span>
        {p.endDate && (
          <span className={`dday-pill dday-${status}`}>{status === "closed" ? "마감됨" : dDayLabel(p.endDate, now)}</span>
        )}
      </div>
    </Link>
  );
}
