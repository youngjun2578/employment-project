/**
 * 채용정보 API 클라이언트 인터페이스.
 * 구현체: FixtureRecruitClient(샘플 JSON) / DataGoKrRecruitClient(실제 API, TODO)
 * 응답 본문은 가공하지 않고(unknown) 그대로 돌려주며, 해석은 mapper.ts 가 맡는다.
 */
export interface ListQuery {
  pageNo: number;
  numOfRows: number;
  /** 접수 중 공고만 */
  ongoingOnly?: boolean;
}

export interface RecruitApiClient {
  readonly name: string;
  /** 목록 1페이지 응답 원문 */
  fetchList(query: ListQuery): Promise<unknown>;
  /** 상세 응답 원문. 없으면 null */
  fetchDetail(sn: string): Promise<unknown | null>;
}
