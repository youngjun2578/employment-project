import type { PostingFilter, StoredPosting } from "../types";

/**
 * 공고 저장소 추상화. 지금은 JSON 파일 구현체만 있고, DB 를 정하면 같은 인터페이스로 구현을 추가한다.
 */
export interface PostingRepository {
  /** 필터 적용 + 마감 임박 순 정렬 */
  list(filter?: PostingFilter): Promise<StoredPosting[]>;
  get(id: string): Promise<StoredPosting | null>;
  /** 필터 선택지(기관명, 직무) */
  filterOptions(): Promise<{ institutions: string[]; jobFields: string[] }>;
  /** 전체 교체 저장(수집기용). 저장 단위가 작아 지금은 통째로 쓴다 */
  saveAll(postings: StoredPosting[], meta?: { source: string }): Promise<void>;
}
