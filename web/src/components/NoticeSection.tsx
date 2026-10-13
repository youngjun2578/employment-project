import { viewerKind } from "@/lib/attachments";
import { ATTACHMENT_TYPE_LABEL, type Posting } from "@/lib/types";
import { NoticeViewer } from "./NoticeViewer";

/** 공고문 열람 영역 + 기타 첨부 목록 */
export function NoticeSection({ posting }: { posting: Posting }) {
  const notices = posting.attachments.filter((a) => a.type === "A");
  // 공고문이 여러 개면 사이트 안에서 열 수 있는 형식을 먼저 보여준다
  const notice =
    notices.find((a) => a.viewUrl && viewerKind(a.extension) !== "unsupported") ?? notices[0] ?? null;
  const others = posting.attachments.filter((a) => a !== notice);

  return (
    <section className="section" aria-labelledby="notice-h">
      <h2 id="notice-h">공고문</h2>
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
          <h3 className="subhead">기타 첨부</h3>
          <ul className="attach-list">
            {others.map((a, i) => {
              const viewable = a.viewUrl && viewerKind(a.extension) !== "unsupported";
              return (
                <li key={i}>
                  <span className="chip">{ATTACHMENT_TYPE_LABEL[a.type]}</span>
                  <span className="name">{a.fileName}</span>
                  {viewable ? (
                    <a href={a.viewUrl!} target="_blank" rel="noopener noreferrer">열람</a>
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
