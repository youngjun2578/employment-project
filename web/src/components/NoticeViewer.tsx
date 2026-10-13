"use client";

import { useCallback, useState } from "react";
import { viewerKind } from "@/lib/attachments";
import type { Attachment } from "@/lib/types";
import { PdfViewer } from "./PdfViewer";

interface Props {
  attachment: Attachment;
  srcUrl: string | null;
}

/**
 * 공고문(첨부 유형 A)을 페이지 안에서 보여준다.
 * PDF → pdf.js 렌더링 / 이미지 → <img> / 그 밖(HWP·HWPX 등)이나 실패 → 변환 안내 fallback
 */
export function NoticeViewer({ attachment, srcUrl }: Props) {
  const [failed, setFailed] = useState(false);
  const onError = useCallback(() => setFailed(true), []);
  const kind = attachment.viewUrl ? viewerKind(attachment.extension) : "unsupported";

  if (failed || kind === "unsupported") {
    return <NoticeFallback attachment={attachment} srcUrl={srcUrl} failed={failed} />;
  }

  return (
    <div className="notice-viewer">
      <div className="viewer-toolbar">
        <span className="viewer-file" title={attachment.fileName}>{attachment.fileName}</span>
        <a className="viewer-link" href={attachment.viewUrl!} target="_blank" rel="noopener noreferrer">
          새 창에서 크게 보기
        </a>
      </div>
      {kind === "pdf" ? (
        <PdfViewer key={attachment.viewUrl} url={attachment.viewUrl!} title={attachment.fileName} onError={onError} />
      ) : (
        // 외부 이미지 최적화 대상이 아니고 원본 해상도가 중요한 공고문이라 <img> 를 그대로 쓴다
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="notice-image"
          src={attachment.viewUrl!}
          alt={`${attachment.fileName} (이미지 공고문)`}
          loading="lazy"
          onError={onError}
        />
      )}
    </div>
  );
}

function NoticeFallback({ attachment, srcUrl, failed }: { attachment: Attachment; srcUrl: string | null; failed: boolean }) {
  const ext = attachment.extension ? attachment.extension.toUpperCase() : "알 수 없는";
  return (
    <div className="notice-fallback" role="status">
      <p className="fallback-title">{failed ? "공고문을 불러오지 못했습니다" : "문서 변환 중"}</p>
      <p>
        {failed
          ? "일시적인 문제로 공고문을 표시하지 못했습니다."
          : `이 공고문은 ${ext} 형식이라 사이트 안에서 바로 보여드릴 수 있도록 변환을 준비하고 있습니다.`}
        {" "}위의 요약 정보를 먼저 확인하시고, 자세한 내용은 기관 원문에서 확인해 주세요.
      </p>
      <p className="viewer-file">{attachment.fileName}</p>
      {srcUrl ? (
        <a className="btn btn-ghost" href={srcUrl} target="_blank" rel="noopener noreferrer">
          기관 원문 공고 보기 <span aria-hidden>↗</span>
        </a>
      ) : (
        <p className="notice-muted">원문 링크가 제공되지 않은 공고입니다.</p>
      )}
    </div>
  );
}
