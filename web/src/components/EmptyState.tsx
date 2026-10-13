import type { ReactNode } from "react";

/** 빈 상태·오류 상태 공통 틀 (장식 아이콘은 인라인 SVG, 외부 이미지 없음) */
export function EmptyState({ kind = "empty", title, children, actions }: {
  kind?: "empty" | "error" | "notfound";
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={`state state-${kind}`} role={kind === "error" ? "alert" : "status"}>
      <svg className="state-icon" viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
        {kind === "error" ? (
          <>
            <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="3" />
            <path d="M24 13v14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            <circle cx="24" cy="34" r="2.2" fill="currentColor" />
          </>
        ) : (
          <>
            <rect x="9" y="7" width="30" height="34" rx="4" fill="none" stroke="currentColor" strokeWidth="3" />
            <path d="M16 17h16M16 24h16M16 31h9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </>
        )}
      </svg>
      <p className="state-title">{title}</p>
      {children && <div className="state-desc">{children}</div>}
      {actions && <div className="state-actions">{actions}</div>}
    </div>
  );
}
