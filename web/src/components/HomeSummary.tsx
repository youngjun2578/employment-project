import Link from "next/link";
import { shortDate } from "./format";
import { NEW_DAYS, type HomeSummary } from "./homeSummary";
import { PostingCard } from "./PostingCard";

export function SummaryStats({ s, today }: { s: HomeSummary; today: string }) {
  const stats = [
    { label: "진행 중인 공고", value: s.ongoing, unit: "건", note: "지금 접수 가능" },
    { label: "이번 주 마감", value: s.thisWeek, unit: "건", note: today === s.weekEnd ? "오늘까지" : `~${shortDate(s.weekEnd)}` },
    { label: "접수 예정", value: s.upcoming, unit: "건", note: "접수 시작 전" },
    { label: "채용 중인 기관", value: s.institutions, unit: "곳", note: "진행 중 공고 기준" },
  ];
  return (
    <section className="summary" aria-labelledby="summary-h">
      <h2 id="summary-h" className="sr-only">채용공고 요약</h2>
      <ul className="stat-grid">
        {stats.map((x) => (
          <li key={x.label} className={`stat${x.value === 0 ? " is-zero" : ""}`}>
            <p className="stat-label">{x.label}</p>
            <p className="stat-value"><strong>{x.value.toLocaleString("ko-KR")}</strong>{x.unit}</p>
            <p className="stat-note">{x.note}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function UrgentStrip({ s, now }: { s: HomeSummary; now: Date }) {
  return (
    <section className="home-block" aria-labelledby="urgent-h">
      <div className="block-head">
        <h2 id="urgent-h" className="section-title">마감 임박</h2>
        <p className="block-sub">3일 안에 마감되는 공고, 가까운 순</p>
        {s.urgent.length > 0 && <Link className="block-more" href="/?status=urgent#list">전체 보기</Link>}
      </div>
      {s.urgent.length === 0 ? (
        <p className="block-empty">지금은 3일 안에 마감되는 공고가 없습니다.</p>
      ) : (
        <ul className="hscroll" aria-label="마감 임박 공고">
          {s.urgent.map((p) => <li key={p.id}><PostingCard p={p} now={now} variant="compact" /></li>)}
        </ul>
      )}
    </section>
  );
}

export function FreshStrip({ s, now }: { s: HomeSummary; now: Date }) {
  if (!s.fresh || s.fresh.length === 0) return null;
  return (
    <section className="home-block" aria-labelledby="fresh-h">
      <div className="block-head">
        <h2 id="fresh-h" className="section-title">새로 올라온 공고</h2>
        <p className="block-sub">최근 {NEW_DAYS}일 안에 이 사이트에 처음 수집된 공고</p>
      </div>
      <ul className="hscroll" aria-label="새로 올라온 공고">
        {s.fresh.map((p) => <li key={p.id}><PostingCard p={p} now={now} variant="compact" /></li>)}
      </ul>
    </section>
  );
}
