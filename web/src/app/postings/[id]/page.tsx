import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NcsPromo } from "@/components/NcsPromo";
import { NoticeSection } from "@/components/NoticeSection";
import { DDay, StatusBadge } from "@/components/StatusBadge";
import { DATA_SOURCE_LABEL, OG_BASE } from "@/lib/config";
import { dDayLabel, deadlineStatus, formatDate } from "@/lib/dates";
import { institutionSlug } from "@/lib/postingQuery";
import { getRepository } from "@/lib/repository";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const p = await getRepository().get(decodeURIComponent((await params).id));
  if (!p) return { title: "공고를 찾을 수 없음", robots: { index: false } };
  const closed = deadlineStatus(p.startDate, p.endDate) === "closed";
  const parts = [
    `${p.institution.name} 채용공고`,
    `접수 ${formatDate(p.startDate)}~${formatDate(p.endDate)}${closed ? "(마감)" : ""}`,
    p.regions.length ? `근무지 ${p.regions.join(", ")}` : null,
    p.hireTypes.length ? p.hireTypes.join(", ") : null,
    p.headcount ? `${p.headcount}명` : null,
  ].filter(Boolean);
  const description = `${parts.join(" · ")}. 공고문을 사이트에서 바로 열람하고 기관 채용 페이지로 지원하세요.`.slice(0, 160);
  const url = `/postings/${encodeURIComponent(p.id)}`;
  const title = `${p.title} - ${p.institution.name}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { ...OG_BASE, title, description, url, type: "article" },
    twitter: { card: "summary", title, description },
  };
}

export default async function PostingPage({ params }: { params: Params }) {
  const p = await getRepository().get(decodeURIComponent((await params).id));
  if (!p) notFound();
  const now = new Date();

  const jobLine = [
    p.jobFields.join(", "),
    p.headcount !== null && p.headcount > 0 ? `총 ${p.headcount}명` : null,
  ].filter(Boolean).join(" · ");

  return (
    <article>
      <nav className="breadcrumb"><Link href="/">← 공고 목록</Link></nav>

      <header className="detail-head">
        <div className="row">
          <StatusBadge startDate={p.startDate} endDate={p.endDate} now={now} />
          <Link className="inst inst-link" href={`/institutions/${encodeURIComponent(institutionSlug(p))}`}>
            {p.institution.name}
          </Link>
          <DDay endDate={p.endDate} now={now} />
        </div>
        <h1>{p.title}</h1>
        <div className="apply-area">
          {p.srcUrl ? (
            <a className="btn btn-primary btn-lg" href={p.srcUrl} target="_blank" rel="noopener noreferrer">
              지원하기 <span aria-hidden>↗</span>
              <span className="sr-only">(기관 채용 페이지가 새 탭에서 열립니다)</span>
            </a>
          ) : (
            <p className="notice-muted" role="note">원문 링크가 제공되지 않은 공고입니다.</p>
          )}
        </div>
        <div className="source-note">
          <p>출처: <strong>{p.institution.name}</strong> 채용공고 ({DATA_SOURCE_LABEL})</p>
          <p>수정·변경 사항은 원문 기준입니다. 지원 전 반드시 기관 원문 공고를 확인하세요.</p>
        </div>
      </header>

      <section className="section" aria-labelledby="summary-h">
        <h2 id="summary-h">요약 정보</h2>
        <dl className="summary-grid">
          <dt>접수기간</dt>
          <dd>
            {formatDate(p.startDate)} ~ {formatDate(p.endDate)}
            {p.endDate && <span className={`dday-inline dday-${deadlineStatus(p.startDate, p.endDate, now)}`}>{dDayLabel(p.endDate, now)}</span>}
          </dd>
          <dt>직무·인원</dt>
          <dd>{jobLine || "정보 없음"}</dd>
          {p.hireTypes.length > 0 || p.recruitType ? (
            <>
              <dt>고용형태</dt>
              <dd>{[p.hireTypes.join(", "), p.recruitType].filter(Boolean).join(" · ")}</dd>
            </>
          ) : null}
          {p.regions.length > 0 && (
            <>
              <dt>근무지</dt>
              <dd>{p.regions.join(", ")}</dd>
            </>
          )}
          <dt>전형절차</dt>
          <dd>
            {p.steps.length ? (
              <ol className="steps">
                {p.steps.map((s, i) => (
                  <li key={i}>
                    {i > 0 && <span className="arrow" aria-hidden>→</span>}
                    <span className="step">{s}</span>
                  </li>
                ))}
              </ol>
            ) : "정보 없음 (공고문 참고)"}
          </dd>
          <dt>응시자격</dt>
          <dd>{p.qualification ? <p className="pre">{p.qualification}</p> : "정보 없음 (공고문 참고)"}</dd>
          {p.preference && (
            <>
              <dt>우대사항</dt>
              <dd><p className="pre">{p.preference}</p></dd>
            </>
          )}
          {p.disqualification && (
            <>
              <dt>결격사유</dt>
              <dd><p className="pre">{p.disqualification}</p></dd>
            </>
          )}
        </dl>
      </section>

      <NoticeSection posting={p} />

      <NcsPromo />
    </article>
  );
}
