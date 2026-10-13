/**
 * 사이트 내부에서 쓰는 정규화된 공고 모델.
 * 외부 API 응답 구조와 분리되어 있으며, API → Posting 변환은 ./mapper.ts 한 곳에서만 한다.
 */

/** 첨부 유형 (코드 정의서 ATCH_TYPE): A 공고문 / B 입사지원서 / C 직무기술서 / Z 기타 */
export type AttachmentType = "A" | "B" | "C" | "Z";

export const ATTACHMENT_TYPE_LABEL: Record<AttachmentType, string> = {
  A: "공고문",
  B: "입사지원서",
  C: "직무기술서",
  Z: "기타",
};

export interface Attachment {
  type: AttachmentType;
  fileName: string;
  /** 소문자, 점 없이. 알 수 없으면 "" */
  extension: string;
  /** 원본 다운로드 URL(외부). 화면에서 직접 쓰지 않는다. */
  sourceUrl: string | null;
  /** 사이트 안에서 열람할 때 쓰는 같은 출처(same-origin) URL */
  viewUrl: string | null;
  sortOrder: number;
}

export interface Posting {
  /** 사이트 URL 에 쓰는 ID (= 공고 일련번호 문자열) */
  id: string;
  /** API 의 공고 일련번호 원본 */
  sourceSn: string;
  institution: {
    code: string | null;
    name: string;
  };
  title: string;
  /** ISO 날짜(YYYY-MM-DD). 파싱 실패/누락 시 null */
  startDate: string | null;
  endDate: string | null;
  regions: string[];
  /** 직무(NCS 분류명 등) */
  jobFields: string[];
  hireTypes: string[];
  recruitType: string | null;
  /** 총 채용 인원. 모르면 null */
  headcount: number | null;
  /** 전형 절차 단계 (예: ["서류전형", "필기전형", "면접전형"]) */
  steps: string[];
  /** 응시자격 등 서술형 텍스트 */
  qualification: string | null;
  preference: string | null;
  disqualification: string | null;
  /** 기관 원문(채용) 페이지 링크. 없으면 null → "지원하기" 숨김 */
  srcUrl: string | null;
  attachments: Attachment[];
  noAttachmentReason: string | null;
}

/** 저장소에 보관되는 형태: Posting + 수집 메타데이터 */
export interface StoredPosting extends Posting {
  meta: {
    /** 중복 제거 키: 기관 + 공고번호 */
    dedupeKey: string;
    firstSeenAt: string;
    lastSeenAt: string;
    /** 내용이 마지막으로 바뀐 시각 */
    updatedAt: string;
    contentHash: string;
    /** 최근 수집에서 목록에 있었는지 */
    sourceState: "listed" | "missing";
  };
}

export type DeadlineStatus = "upcoming" | "open" | "urgent" | "closed" | "unknown";

export interface PostingFilter {
  institution?: string;
  jobField?: string;
  /** "active" = 마감 전(접수예정·접수중·마감임박) */
  status?: DeadlineStatus | "active";
  /** 기준 시각(테스트용). 기본은 현재 */
  now?: Date;
}
