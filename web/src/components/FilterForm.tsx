"use client";

import Link from "next/link";
import { useRef } from "react";
import { STATUS_OPTIONS } from "./StatusBadge";

interface Props {
  institutions: string[];
  jobFields: string[];
  value: { q: string; institution: string; jobField: string; status: string };
}

/**
 * GET 폼이라 JS 없이도 동작한다. JS 가 있으면 선택 즉시 적용.
 * 필터 상태는 URL 쿼리에 남아 공유·뒤로가기가 된다.
 */
export function FilterForm({ institutions, jobFields, value }: Props) {
  const ref = useRef<HTMLFormElement>(null);
  const submit = () => ref.current?.requestSubmit();
  return (
    <form ref={ref} className="filters" method="get" action="/" role="search" aria-label="공고 검색과 필터">
      <div className="search-row">
        <label className="search-label">
          <span className="sr-only">제목·기관명 검색</span>
          <input
            type="search"
            name="q"
            defaultValue={value.q}
            placeholder="공고 제목이나 기관명으로 검색"
            maxLength={100}
            enterKeyHint="search"
          />
        </label>
        <button className="btn btn-primary" type="submit">검색</button>
      </div>
      <label>
        기관
        <select name="inst" defaultValue={value.institution} onChange={submit}>
          <option value="">전체 기관</option>
          {institutions.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
      </label>
      <label>
        직무
        <select name="job" defaultValue={value.jobField} onChange={submit}>
          <option value="">전체 직무</option>
          {jobFields.map((j) => <option key={j} value={j}>{j}</option>)}
        </select>
      </label>
      <label>
        마감 상태
        <select name="status" defaultValue={value.status} onChange={submit}>
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <div className="actions">
        <Link className="btn btn-ghost" href="/">초기화</Link>
      </div>
    </form>
  );
}
