"use client";

import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";

/** 페이지 렌더링 오류 화면. 내부 오류 내용은 보여주지 않는다 */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState
      kind="error"
      title="공고를 불러오지 못했습니다"
      actions={
        <>
          <button className="btn btn-primary" type="button" onClick={() => reset()}>다시 시도</button>
          <Link className="btn btn-secondary" href="/">첫 화면으로</Link>
        </>
      }
    >
      <p>일시적인 문제일 수 있습니다. 잠시 후 다시 시도해 주세요.</p>
    </EmptyState>
  );
}
