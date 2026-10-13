/** 서버 렌더링을 기다리는 동안의 자리표시(카드 모양 뼈대) */
export default function Loading() {
  return (
    <div className="loading" aria-busy="true" aria-live="polite">
      <p className="sr-only">공고를 불러오는 중입니다.</p>
      <div className="skeleton skeleton-search" />
      <div className="skeleton-chips">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton skeleton-chip" />)}
      </div>
      <ul className="card-grid" aria-hidden="true">
        {Array.from({ length: 4 }, (_, i) => (
          <li key={i} className="pcard skeleton-card">
            <div className="skeleton skeleton-line short" />
            <div className="skeleton skeleton-line" />
            <div className="skeleton skeleton-line mid" />
          </li>
        ))}
      </ul>
    </div>
  );
}
