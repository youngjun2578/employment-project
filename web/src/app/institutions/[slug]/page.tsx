import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InstitutionAvatar } from "@/components/InstitutionAvatar";
import { PostingCard } from "@/components/PostingCard";
import { deadlineStatus } from "@/lib/dates";
import { institutionSlug } from "@/lib/postingQuery";
import { OG_BASE } from "@/lib/config";
import { getRepository } from "@/lib/repository";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

async function load(slugParam: string) {
  const slug = decodeURIComponent(slugParam);
  const now = new Date();
  const postings = (await getRepository().list({ now })).filter((p) => institutionSlug(p) === slug);
  return { slug, now, postings, name: postings[0]?.institution.name ?? null };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug, name, postings, now } = await load((await params).slug);
  if (!name) return { title: "기관을 찾을 수 없음", robots: { index: false } };
  const active = postings.filter((p) => deadlineStatus(p.startDate, p.endDate, now) !== "closed").length;
  const description = `${name} 채용공고 모아보기. 마감 전 ${active}건, 전체 ${postings.length}건의 접수기간과 공고문을 확인하세요.`;
  const url = `/institutions/${encodeURIComponent(slug)}`;
  return {
    title: `${name} 채용공고`,
    description,
    alternates: { canonical: url },
    openGraph: { ...OG_BASE, title: `${name} 채용공고`, description, url, type: "website" },
  };
}

export default async function InstitutionPage({ params }: { params: Params }) {
  const { name, postings, now } = await load((await params).slug);
  if (!name) notFound();
  const firstClosed = postings.findIndex((p) => deadlineStatus(p.startDate, p.endDate, now) === "closed");
  const active = firstClosed === -1 ? postings.length : firstClosed;

  return (
    <>
      <nav className="breadcrumb" aria-label="이동 경로"><Link href="/institutions">← 기관별 채용공고</Link></nav>
      <header className="inst-hero">
        <InstitutionAvatar name={name} size="lg" muted={active === 0} />
        <div className="inst-hero-text">
          <h1 className="page-title">{name}</h1>
          <p className="page-sub">마감 전 {active}건 · 전체 {postings.length}건</p>
        </div>
      </header>
      {active > 0 && (
        <ul className="card-grid">
          {postings.slice(0, active).map((p) => <li key={p.id}><PostingCard p={p} now={now} headingLevel={2} /></li>)}
        </ul>
      )}
      {active === 0 && <p className="block-empty">지금 마감 전인 공고가 없습니다.</p>}
      {firstClosed !== -1 && (
        <>
          <h2 className="group-title">마감된 공고 <span className="group-count">{postings.length - active}건</span></h2>
          <ul className="card-grid">
            {postings.slice(active).map((p) => <li key={p.id}><PostingCard p={p} now={now} headingLevel={3} /></li>)}
          </ul>
        </>
      )}
    </>
  );
}
