/**
 * 채용공고 수집기
 *
 *   npx tsx scripts/collect.ts                       # fixture(샘플 JSON) → data/postings.json
 *   npx tsx scripts/collect.ts --dry-run             # 저장하지 않고 통계만
 *   npx tsx scripts/collect.ts --source live         # 실제 API (TODO: 아직 미구현, DATA_GO_KR_KEY 필요)
 *
 * 흐름: API 호출 → mapper 정규화 → 기관+공고번호 중복 제거 → 변경·마감 상태 갱신 → repository 저장
 * 서비스키는 DATA_GO_KR_KEY 환경변수에서만 읽고, 출력은 모두 redactKey() 를 거친다.
 */
import path from "node:path";
import { parseArgs } from "node:util";
import { collect } from "../src/lib/collector/pipeline";
import { JsonFilePostingRepository } from "../src/lib/repository/jsonFileRepository";
import { MemoryPostingRepository } from "../src/lib/repository/memoryRepository";
import type { RecruitApiClient } from "../src/lib/source/client";
import { DataGoKrRecruitClient, redactKey } from "../src/lib/source/dataGoKrClient";
import { FixtureRecruitClient } from "../src/lib/source/fixtureClient";

const { values } = parseArgs({
  options: {
    source: { type: "string", default: "fixture" },
    out: { type: "string", default: "data/postings.json" },
    "max-pages": { type: "string", default: "20" },
    "max-calls": { type: "string", default: "300" },
    "dry-run": { type: "boolean", default: false },
  },
});

const log = (msg: string) => console.log(redactKey(msg));

async function main() {
  let client: RecruitApiClient;
  if (values.source === "fixture") client = new FixtureRecruitClient();
  else if (values.source === "live") client = new DataGoKrRecruitClient();
  else throw new Error(`알 수 없는 source: ${values.source} (fixture | live)`);

  const outPath = path.resolve(process.cwd(), values.out!);
  const repo = values["dry-run"] ? new MemoryPostingRepository() : new JsonFilePostingRepository(outPath);
  log(`수집 시작: source=${client.name}${values["dry-run"] ? " (dry-run)" : ` → ${path.relative(process.cwd(), outPath)}`}`);

  const stats = await collect({
    client,
    repo,
    maxPages: Number(values["max-pages"]),
    maxCalls: Number(values["max-calls"]),
    log,
  });
  log(`완료: ${JSON.stringify(stats)}`);
  if (stats.hitCallLimit) log("⚠️ 호출 상한에 도달해 일부 상세를 받지 못했습니다.");
  if (client.name === "fixture" && !values["dry-run"]) {
    log("참고: fixture 결과는 샘플(가짜) 데이터입니다. 실제 서비스에 배포하지 마세요.");
  }
}

main().catch((e: unknown) => {
  console.error(redactKey(e instanceof Error ? `${e.name}: ${e.message}` : String(e)));
  process.exit(1);
});
