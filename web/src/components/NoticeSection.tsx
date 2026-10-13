import { resolveView } from "@/lib/attachments";
import { ATTACHMENT_TYPE_LABEL, type Posting } from "@/lib/types";
import { NoticeViewer } from "./NoticeViewer";

/** 공고문 열람 영역 + 기타 첨부 목록 */
export function NoticeSection({ posting }: { posting: Posting }) {
  const notices = posting.attachments.filter((a) => a.type === "A");
  // 공고문이 여러 개면 사이트 안에서 열 수 있는 형식을 먼저 보여준다
  const notice = notices.find((a) => resolveView(a).kind !== "unsupported") ?? notices[0] ?? null;
  const others = posting.attachments.filter((a) => a !== notice);

  return (
    <section className="section notice-section" aria-labelledby="notice-h">
      <div className="section-heading">
        <h2 id="notice-h">공고문</h2>
        <p className="section-guide">첨부된 공고문을 이 페이지에서 바로 볼 수 있습니다. 내용이 다르면 기관 원문이 우선합니다.</p>
      </div>
      {notice ? (
        <NoticeViewer attachment={notice} srcUrl={posting.srcUrl} />
      ) : (
        <p className="notice-muted">
          첨부된 공고문이 없습니다.{posting.noAttachmentReason ? ` (${posting.noAttachmentReason})` : ""}
          {posting.srcUrl ? " 자세한 내용은 기관 원문에서 확인해 주세요." : ""}
        </p>
      )}
      {others.length > 0 && (
        <>
          <h3 className="subhead">다른 첨부 파일</h3>
          <ul className="attach-list">
            {others.map((a, i) => {
              const v = resolveView(a);
              return (
                <li key={i}>
                  <span className="chip">{ATTACHMENT_TYPE_LABEL[a.type]}</span>
                  <span className="name">{a.fileName}</span>
                  {v.url ? (
                    <a href={v.url} target="_blank" rel="noopener noreferrer">열람</a>
                  ) : (
                    <span className="muted-text">사이트 내 열람 준비 중</span>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
