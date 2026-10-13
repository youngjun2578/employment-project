import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { InstitutionAvatar } from "@/components/InstitutionAvatar";
import { deadlineStatus } from "@/lib/dates";
import { institutionSlug } from "@/lib/postingQuery";
import { getRepository } from "@/lib/repository";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "기관별 채용공고",
  description: "공공기관·공기업별로 마감 전 채용공고 수를 확인하고 기관별 공고를 모아 보세요.",
  alternates: { canonical: "/institutions" },
};

export default async function InstitutionsPage() {
  const now = new Date();
  const all = await getRepository().list({ now });
  const map = new Map<string, { name: string; slug: string; active: number; total: number }>();
  for (const p of all) {
    const slug = institutionSlug(p);
    const row = map.get(slug) ?? { name: p.institution.name, slug, active: 0, total: 0 };
    row.total++;
    if (deadlineStatus(p.startDate, p.endDate, now) !== "closed") row.active++;
    map.set(slug, row);
  }
  const rows = [...map.values()].sort((a, b) => b.active - a.active || a.name.localeCompare(b.name, "ko"));

  return (
    <>
      <nav className="breadcrumb" aria-label="이동 경로"><Link href="/">← 첫 화면</Link></nav>
      <div className="page-head">
        <h1 className="page-title">기관별 채용공고</h1>
        <p className="page-sub">마감 전 공고가 많은 기관 순입니다. 기관 {rows.length}곳</p>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="표시할 기관이 없습니다" actions={<Link className="btn btn-primary" href="/">첫 화면으로</Link>} />
      ) : (
        <ul className="inst-grid">
          {rows.map((r) => (
            <li key={r.slug}>
              <Link href={`/institutions/${encodeURIComponent(r.slug)}`} className={`inst-card${r.active === 0 ? " is-closed" : ""}`}>
                <InstitutionAvatar name={r.name} size="md" muted={r.active === 0} />
                <span className="inst-card-body">
                  <span className="inst-card-name">{r.name}</span>
                  <span className="inst-card-count">
                    {r.active > 0 ? <>마감 전 <strong>{r.active}</strong>건</> : "마감 전 공고 없음"}
                    <span className="inst-card-total"> · 전체 {r.total}건</span>
                  </span>
                </span>
                <span className="inst-card-arrow" aria-hidden="true">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
