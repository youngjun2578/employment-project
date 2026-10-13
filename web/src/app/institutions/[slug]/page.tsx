import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
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
  const description = `${name} 채용공고 모아보기. 진행 중 ${active}건, 전체 ${postings.length}건의 접수기간과 공고문을 확인하세요.`;
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
      <nav className="breadcrumb"><Link href="/institutions">← 기관별 채용공고</Link></nav>
      <h1 className="page-title">{name} 채용공고</h1>
      <p className="page-sub">진행 중 {active}건 · 전체 {postings.length}건. 마감이 가까운 순입니다.</p>
      <ul className="posting-list">
        {postings.map((p, i) => (
          <li key={p.id}>
            {i === firstClosed && firstClosed > 0 && <h2 className="subhead" style={{ marginTop: 18 }}>마감된 공고</h2>}
            <PostingCard p={p} now={now} />
          </li>
        ))}
      </ul>
    </>
  );
}
