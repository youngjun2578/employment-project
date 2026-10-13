import Link from "next/link";
import { FilterForm } from "@/components/FilterForm";
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

  return (
    <>
      <h1 className="page-title">공공기관 채용공고</h1>
      <p className="page-sub">마감이 가까운 순으로 보여줍니다. 마감된 공고는 목록 아래쪽에 따로 표시됩니다.</p>
      <FilterForm
        // 쿼리가 바뀌면(초기화 포함) select 의 defaultValue 를 다시 반영하도록 재마운트
        key={`${q}|${institution}|${jobField}|${status}`}
        institutions={options.institutions}
        jobFields={options.jobFields}
        value={{ q, institution, jobField, status }}
      />
      <p className="result-count" aria-live="polite">
        {q && <>‘{q}’ 검색 결과 </>}총 <strong>{postings.length}</strong>건
        <Link className="inline-link" href="/institutions">기관별로 보기</Link>
      </p>
      {postings.length === 0 ? (
        <div className="empty">조건에 맞는 공고가 없습니다.</div>
      ) : (
        <ul className="posting-list">
          {postings.map((p, i) => (
            <li key={p.id}>
              {i === firstClosed && firstClosed > 0 && (
                <h2 className="subhead" style={{ marginTop: 18 }}>마감된 공고</h2>
              )}
              <PostingCard p={p} now={now} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
