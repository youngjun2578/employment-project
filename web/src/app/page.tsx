import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { FreshStrip, SummaryStats, UrgentStrip } from "@/components/HomeSummary";
import { summarize } from "@/components/homeSummary";
import { shortDate } from "@/components/format";
import { FilterBar, SearchBox } from "@/components/FilterBar";
import { listHref, type ListParams } from "@/components/filterUrl";
import { PostingCard } from "@/components/PostingCard";
import { STATUS_OPTIONS } from "@/components/StatusBadge";
import { deadlineStatus, todayKst } from "@/lib/dates";
import { getRepository } from "@/lib/repository";
import type { PostingFilter } from "@/lib/types";

// 마감 상태는 요청 시각 기준으로 계산하므로 매 요청 렌더링
export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function Home({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = one(sp.q).trim().slice(0, 100);
  const institution = one(sp.inst);
  const jobField = one(sp.job);
  const statusRaw = one(sp.status) || "all";
  const status = STATUS_OPTIONS.some((o) => o.value === statusRaw) ? statusRaw : "all";
  const params: ListParams = { q, inst: institution, job: jobField, status };

  const repo = getRepository();
  const now = new Date();
  const filter: PostingFilter = {
    q: q || undefined,
    institution: institution || undefined,
    jobField: jobField || undefined,
    status: status === "all" ? undefined : (status as PostingFilter["status"]),
    now,
  };
  const filtered = !!(q || institution || jobField || status !== "all");
  const [postings, options, all] = await Promise.all([
    repo.list(filter),
    repo.filterOptions(),
    filtered ? Promise.resolve(null) : repo.list({ now }),
  ]);
  // 요약은 조건 없이 첫 화면에 들어왔을 때만 (검색·필터 중에는 결과를 먼저 보여준다)
  const summary = all ? summarize(all, now) : null;
  const today = todayKst(now);
  const firstClosed = postings.findIndex((p) => deadlineStatus(p.startDate, p.endDate, now) === "closed");
  const open = firstClosed === -1 ? postings : postings.slice(0, firstClosed);
  const closed = firstClosed === -1 ? [] : postings.slice(firstClosed);

  return (
    <>
      <div className="home-hero">
        <h1 className="page-title">공공기관 채용공고</h1>
        <p className="page-sub">{shortDate(today)} 기준</p>
        <SearchBox value={params} />
      </div>

      {summary && (summary.total === 0 ? (
        <EmptyState title="아직 수집된 공고가 없습니다">
          <p>공고를 모으는 중입니다. 잠시 후 다시 확인해 주세요.</p>
        </EmptyState>
      ) : (
        <>
          <SummaryStats s={summary} today={today} />
          <UrgentStrip s={summary} now={now} />
          <FreshStrip s={summary} now={now} />
        </>
      ))}

      {summary?.total !== 0 && (
      <section id="list" className="list-section" aria-labelledby="list-h">
        <div className="block-head">
          <h2 id="list-h" className="section-title">{filtered ? "찾은 공고" : "전체 공고"}</h2>
          <p className="block-sub">마감이 가까운 순, 마감된 공고는 아래쪽</p>
        </div>

        <FilterBar value={params} institutions={options.institutions} jobFields={options.jobFields} />

        <p className="result-count" aria-live="polite">
          {q ? <>‘{q}’ 검색 결과 </> : filtered ? "조건에 맞는 공고 " : "전체 "}
          <strong>{postings.length}</strong>건
        </p>

        {postings.length === 0 ? (
          <EmptyState
            title={q ? "검색 결과가 없습니다" : "조건에 맞는 공고가 없습니다"}
            actions={
              <>
                {filtered && <Link className="btn btn-primary" href="/#list">조건 모두 지우기</Link>}
                <Link className="btn btn-secondary" href="/institutions">기관별로 보기</Link>
              </>
            }
          >
            <p>{q ? "검색어를 줄이거나 다른 말로 바꿔 보세요. 제목과 기관명에서 찾습니다." : "마감 상태나 기관·직무 조건을 바꿔 보세요."}</p>
            {q && status !== "all" && (
              <p><Link href={listHref(params, { status: "all" })}>마감된 공고까지 포함해서 다시 찾기</Link></p>
            )}
          </EmptyState>
        ) : (
          <>
            {open.length > 0 && (
              <ul className="card-grid">
                {open.map((p) => <li key={p.id}><PostingCard p={p} now={now} /></li>)}
              </ul>
            )}
            {closed.length > 0 && (
              <>
                <h3 className="group-title">마감된 공고 <span className="group-count">{closed.length}건</span></h3>
                <ul className="card-grid">
                  {closed.map((p) => <li key={p.id}><PostingCard p={p} now={now} /></li>)}
                </ul>
              </>
            )}
          </>
        )}
      </section>
      )}
    </>
  );
}
