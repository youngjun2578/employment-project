import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NcsPromo } from "@/components/NcsPromo";
import { NoticeSection } from "@/components/NoticeSection";
import { shortDate } from "@/components/format";
import { InstitutionAvatar } from "@/components/InstitutionAvatar";
import { StatusBadge } from "@/components/StatusBadge";
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

  const status = deadlineStatus(p.startDate, p.endDate, now);
  const instHref = `/institutions/${encodeURIComponent(institutionSlug(p))}`;
  // 핵심 정보에는 앞 3개만, 전체 목록은 모집 요강에
  const jobs = p.jobFields.length
    ? p.jobFields.slice(0, 3).join(", ") + (p.jobFields.length > 3 ? ` 외 ${p.jobFields.length - 3}개` : "")
    : null;
  const headcount = p.headcount !== null && p.headcount > 0 ? `${p.headcount.toLocaleString("ko-KR")}명` : null;

  return (
    <article className={`detail${p.srcUrl ? " has-apply-bar" : ""}`}>
      <nav className="breadcrumb" aria-label="이동 경로"><Link href="/#list">← 공고 목록</Link></nav>

      <header className="detail-hero">
        <Link className="detail-inst" href={instHref}>
          <InstitutionAvatar name={p.institution.name} size="md" muted={status === "closed"} />
          <span className="detail-inst-name">{p.institution.name}</span>
          <span className="sr-only">기관 공고 모아보기</span>
        </Link>
        <h1 className="detail-title">{p.title}</h1>
        <div className="detail-status">
          <StatusBadge startDate={p.startDate} endDate={p.endDate} now={now} />
          {status === "upcoming" && p.startDate && <span className="dday-pill dday-upcoming">접수 시작 {dDayLabel(p.startDate, now)}</span>}
          {p.endDate && <span className={`dday-pill dday-${status}`}>{status === "closed" ? "마감됨" : dDayLabel(p.endDate, now).startsWith("D-") ? `마감 ${dDayLabel(p.endDate, now)}` : dDayLabel(p.endDate, now)}</span>}
        </div>

        <dl className="keyfacts">
          <div className="keyfact">
            <dt>접수기간</dt>
            <dd>
              {p.startDate || p.endDate ? <>{shortDate(p.startDate)} ~ {shortDate(p.endDate)}</> : "기간 정보 없음 (원문 확인)"}
            </dd>
          </div>
          <div className="keyfact">
            <dt>직무·인원</dt>
            <dd>{[jobs, headcount].filter(Boolean).join(" · ") || "정보 없음 (공고문 참고)"}</dd>
          </div>
          <div className="keyfact">
            <dt>전형절차</dt>
            <dd>
              {p.steps.length ? (
                <ol className="steps">
                  {p.steps.map((s, i) => (
                    <li key={i}>
                      <span className="step">{s}</span>
                      {i < p.steps.length - 1 && <span className="arrow" aria-hidden>›</span>}
                    </li>
                  ))}
                </ol>
              ) : "정보 없음 (공고문 참고)"}
            </dd>
          </div>
        </dl>

        {p.srcUrl ? (
          <div className="apply-bar">
            <p className="apply-note" id="apply-note">
              <span>기관 채용 사이트로 이동합니다.</span> <span>접수 방법은 원문 기준입니다.</span>
            </p>
            <a className="btn btn-primary btn-lg apply-btn" href={p.srcUrl} target="_blank" rel="noopener noreferrer" aria-describedby="apply-note">
              지원하기 <span aria-hidden>↗</span>
              <span className="sr-only">(새 탭)</span>
            </a>
          </div>
        ) : (
          <p className="notice-muted apply-missing" role="note">원문 링크가 제공되지 않은 공고입니다. 지원 방법은 공고문을 확인해 주세요.</p>
        )}
      </header>

      <section className="section" aria-labelledby="detail-h">
        <h2 id="detail-h">모집 요강</h2>
        <dl className="info-list">
          {p.jobFields.length > 3 && <div><dt>직무(전체)</dt><dd>{p.jobFields.join(", ")}</dd></div>}
          {p.hireTypes.length > 0 || p.recruitType ? (
            <div><dt>고용형태</dt><dd>{[p.hireTypes.join(", "), p.recruitType].filter(Boolean).join(" · ")}</dd></div>
          ) : null}
          {p.regions.length > 0 && <div><dt>근무지</dt><dd>{p.regions.join(", ")}</dd></div>}
          <div><dt>응시자격</dt><dd>{p.qualification ? <p className="pre">{p.qualification}</p> : "정보 없음 (공고문 참고)"}</dd></div>
          {p.preference && <div><dt>우대사항</dt><dd><p className="pre">{p.preference}</p></dd></div>}
          {p.disqualification && <div><dt>결격사유</dt><dd><p className="pre">{p.disqualification}</p></dd></div>}
        </dl>
      </section>

      <NoticeSection posting={p} />

      <aside className="source-box" aria-label="출처 안내">
        <p>출처: <strong>{p.institution.name}</strong> 채용공고 ({DATA_SOURCE_LABEL})</p>
        <p>수정·변경 사항은 원문 기준입니다. 지원 전 반드시 기관 원문 공고를 확인하세요.</p>
      </aside>

      <NcsPromo />
    </article>
  );
}
