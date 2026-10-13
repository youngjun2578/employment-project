import Link from "next/link";
import { listHref, type ListParams } from "./filterUrl";
import { STATUS_OPTIONS } from "./StatusBadge";

interface Props {
  value: ListParams;
  institutions: string[];
  jobFields: string[];
}

/** 상태 빠른 선택 칩 순서와 짧은 라벨 */
const QUICK_STATUS: { value: string; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "active", label: "마감 전" },
  { value: "urgent", label: "마감 임박" },
  { value: "open", label: "진행 중" },
  { value: "upcoming", label: "접수 예정" },
  { value: "closed", label: "마감" },
];

/**
 * 검색 + 상태 칩(가로 스크롤) + 접이식 상세 필터 + 적용된 필터 표시.
 * 모두 링크·GET 폼이라 JS 없이 동작하고, 상태는 URL 에 남아 공유·뒤로가기가 된다.
 */
export function FilterBar({ value, institutions, jobFields }: Props) {
  const detailCount = (value.inst ? 1 : 0) + (value.job ? 1 : 0);
  const statusLabel = STATUS_OPTIONS.find((o) => o.value === value.status)?.label;
  const active: { key: keyof ListParams; label: string }[] = [
    ...(value.q ? [{ key: "q" as const, label: `검색: ${value.q}` }] : []),
    ...(value.inst ? [{ key: "inst" as const, label: `기관: ${value.inst}` }] : []),
    ...(value.job ? [{ key: "job" as const, label: `직무: ${value.job}` }] : []),
    ...(value.status !== "all" && statusLabel ? [{ key: "status" as const, label: `상태: ${statusLabel}` }] : []),
  ];

  return (
    <div className="filterbar">
      <form className="searchbox" method="get" action="/#list" role="search" aria-label="공고 검색">
        <label htmlFor="q" className="sr-only">공고 제목이나 기관명으로 검색</label>
        <svg className="searchbox-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M20 20l-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input id="q" className="searchbox-input" type="search" name="q" defaultValue={value.q}
          placeholder="공고 제목, 기관명 검색" maxLength={100} enterKeyHint="search" autoComplete="off" />
        {value.inst && <input type="hidden" name="inst" value={value.inst} />}
        {value.job && <input type="hidden" name="job" value={value.job} />}
        {value.status !== "all" && <input type="hidden" name="status" value={value.status} />}
        <button className="btn btn-primary searchbox-btn" type="submit">검색</button>
      </form>

      <div className="filter-row">
        <nav className="status-chips" aria-label="마감 상태로 보기">
          {QUICK_STATUS.map((s) => {
            const on = value.status === s.value;
            return (
              <Link key={s.value} href={listHref(value, { status: s.value })} className={`fchip${on ? " is-on" : ""}`}
                aria-current={on ? "true" : undefined} scroll={false}>
                {s.label}
              </Link>
            );
          })}
        </nav>

        <details className="filter-panel" open={detailCount > 0 || undefined}>
          <summary className="fchip fchip-toggle">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            필터{detailCount > 0 && <span className="fchip-count" aria-label={`${detailCount}개 적용됨`}>{detailCount}</span>}
          </summary>
          <form className="filter-form" method="get" action="/#list">
            {value.q && <input type="hidden" name="q" value={value.q} />}
            {value.status !== "all" && <input type="hidden" name="status" value={value.status} />}
            <div className="field">
              <label className="field-label" htmlFor="f-inst">기관</label>
              <select id="f-inst" className="select" name="inst" defaultValue={value.inst}>
                <option value="">전체 기관</option>
                {institutions.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="f-job">직무</label>
              <select id="f-job" className="select" name="job" defaultValue={value.job}>
                <option value="">전체 직무</option>
                {jobFields.map((j) => <option key={j} value={j}>{j}</option>)}
              </select>
            </div>
            <div className="filter-actions">
              <button className="btn btn-primary" type="submit">적용</button>
              <Link className="btn btn-secondary" href={listHref(value, { inst: "", job: "" })} scroll={false}>기관·직무 해제</Link>
            </div>
          </form>
        </details>
      </div>

      {active.length > 0 && (
        <div className="active-filters" aria-label="적용된 조건">
          <ul>
            {active.map((a) => (
              <li key={a.key}>
                <Link className="achip" href={listHref(value, { [a.key]: a.key === "status" ? "all" : "" })} scroll={false}>
                  <span className="achip-text">{a.label}</span>
                  <span aria-hidden="true" className="achip-x">×</span>
                  <span className="sr-only">조건 해제</span>
                </Link>
              </li>
            ))}
          </ul>
          <Link className="achip-clear" href="/#list" scroll={false}>모두 지우기</Link>
        </div>
      )}
    </div>
  );
}
