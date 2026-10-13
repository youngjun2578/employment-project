import path from "node:path";
import { sampleDataset, USE_SAMPLE } from "../config";
import { JsonFilePostingRepository } from "./jsonFileRepository";
import { SamplePostingRepository } from "./sampleRepository";
import type { PostingRepository } from "./types";

export type { PostingRepository } from "./types";

/** 실제 수집 결과 파일 위치 (수집기가 쓰고 사이트가 읽는다) */
export const POSTINGS_FILE = path.join(process.cwd(), "data", "postings.json");

let repo: PostingRepository | null = null;

/** 서버 전용. 샘플 모드 여부에 따라 구현체를 고른다 */
export function getRepository(): PostingRepository {
  repo ??= USE_SAMPLE
    ? new SamplePostingRepository(
        sampleDataset() === "stress" ? path.join(process.cwd(), "data", "sample-stress", "raw") : undefined,
      )
    : new JsonFilePostingRepository(POSTINGS_FILE);
  return repo;
}
