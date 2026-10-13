import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { FilterBar } from "@/components/FilterBar";
import { listHref, type ListParams } from "@/components/filterUrl";
import { PostingCard } from "@/components/PostingCard";
import { STATUS_OPTIONS } from "@/components/StatusBadge";
import { deadlineStatus } from "@/lib/dates";
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
  const [postings, options] = await Promise.all([repo.list(filter), repo.filterOptions()]);
  const firstClosed = postings.findIndex((p) => deadlineStatus(p.startDate, p.endDate, now) === "closed");
  const open = firstClosed === -1 ? postings : postings.slice(0, firstClosed);
  const closed = firstClosed === -1 ? [] : postings.slice(firstClosed);
  const filtered = !!(q || institution || jobField || status !== "all");

  return (
    <>
      <section id="list" className="list-section" aria-labelledby="list-h">
        <div className="section-head">
          <h1 id="list-h" className="page-title">공공기관 채용공고</h1>
          <p className="page-sub">마감이 가까운 순으로 보여줍니다.</p>
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
                <h2 className="group-title">마감된 공고 <span className="group-count">{closed.length}건</span></h2>
                <ul className="card-grid">
                  {closed.map((p) => <li key={p.id}><PostingCard p={p} now={now} /></li>)}
                </ul>
              </>
            )}
          </>
        )}
      </section>
    </>
  );
}
