import { ncsUrl } from "@/lib/config";

/**
 * 상세 페이지 하단의 외부 사이트 안내.
 * 공고·기관과 연결된 주장(출제 유형, 합격 가능성 등)은 쓰지 않는다.
 */
export function NcsPromo() {
  return (
    <aside className="ncs-promo" aria-label="외부 사이트 안내">
      <div className="ncs-text">
        <p className="ncs-title">NCS 수리능력, 가볍게 점검해 보기</p>
        <p className="ncs-desc">NCS 직업기초능력 가운데 수리능력 문제를 맛보기로 풀어볼 수 있는 외부 사이트입니다.</p>
      </div>
      <a className="btn btn-ncs" href={ncsUrl()} target="_blank" rel="noopener">
        NCS 수리능력 맛보기 진단 해보기 <span aria-hidden>↗</span>
        <span className="sr-only">(외부 사이트, 새 탭)</span>
      </a>
    </aside>
  );
}
