import { ATTACHMENT_TYPE_LABEL, type Posting } from "@/lib/types";

/** 공고문 열람 영역 + 기타 첨부 목록 (열람 컴포넌트는 4단계에서 연결) */
export function NoticeSection({ posting }: { posting: Posting }) {
  const notice = posting.attachments.find((a) => a.type === "A") ?? null;
  const others = posting.attachments.filter((a) => a !== notice);
  return (
    <section className="section" aria-labelledby="notice-h">
      <h2 id="notice-h">공고문</h2>
      {notice ? (
        <p>{notice.fileName}</p>
      ) : (
        <p className="notice-muted">
          첨부된 공고문이 없습니다.{posting.noAttachmentReason ? ` (${posting.noAttachmentReason})` : ""}
        </p>
      )}
      {others.length > 0 && (
        <>
          <h3 className="subhead">기타 첨부</h3>
          <ul className="attach-list">
            {others.map((a, i) => (
              <li key={i}>
                <span className="chip">{ATTACHMENT_TYPE_LABEL[a.type]}</span>
                <span className="name">{a.fileName}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
