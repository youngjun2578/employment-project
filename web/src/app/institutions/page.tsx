import type { Metadata } from "next";
import Link from "next/link";
import { deadlineStatus } from "@/lib/dates";
import { institutionSlug } from "@/lib/postingQuery";
import { getRepository } from "@/lib/repository";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "기관별 채용공고",
  description: "공공기관·공기업별로 진행 중인 채용공고 수를 확인하고 기관별 공고를 모아 보세요.",
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
      <nav className="breadcrumb"><Link href="/">← 공고 목록</Link></nav>
      <h1 className="page-title">기관별 채용공고</h1>
      <p className="page-sub">진행 중인 공고가 많은 기관 순입니다.</p>
      {rows.length === 0 ? (
        <div className="empty">표시할 기관이 없습니다.</div>
      ) : (
        <ul className="inst-list">
          {rows.map((r) => (
            <li key={r.slug}>
              <Link href={`/institutions/${encodeURIComponent(r.slug)}`} className="inst-row">
                <span className="inst-name">{r.name}</span>
                <span className="inst-count">
                  진행 중 <strong>{r.active}</strong>건 <span className="muted-text">/ 전체 {r.total}건</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
