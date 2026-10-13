/**
 * 채용공고 수집기
 *
 *   npx tsx scripts/collect.ts                       # fixture(샘플 JSON) → data/postings.json
 *   npx tsx scripts/collect.ts --dry-run             # 저장하지 않고 통계만
 *   npx tsx scripts/collect.ts --source live         # 실제 API (DATA_GO_KR_KEY 필요)
 *   npx tsx scripts/collect.ts --attachments         # 공고문 첨부를 받아 변환·저장(data/attachments/)
 *
 * 흐름: API 호출 → mapper 정규화 → 기관+공고번호 중복 제거 → 변경·마감 상태 갱신 → repository 저장
 * 서비스키는 DATA_GO_KR_KEY 환경변수에서만 읽고, 출력은 모두 redactKey() 를 거친다.
 */
import path from "node:path";
import { parseArgs } from "node:util";
import { collect } from "../src/lib/collector/pipeline";
import { AttachmentPipeline, LocalFileAttachmentStore } from "../src/lib/pipeline/attachments";
import { defaultFetcher } from "../src/lib/pipeline/attachments/fetchers";
import { JsonFilePostingRepository } from "../src/lib/repository/jsonFileRepository";
import { MemoryPostingRepository } from "../src/lib/repository/memoryRepository";
import type { RecruitApiClient } from "../src/lib/source/client";
import { CallBudget, DataGoKrApiError, DataGoKrRecruitClient, MissingServiceKeyError, redactKey } from "../src/lib/source/dataGoKrClient";
import { FixtureRecruitClient } from "../src/lib/source/fixtureClient";

const { values } = parseArgs({
  options: {
    source: { type: "string", default: "fixture" },
    out: { type: "string", default: "data/postings.json" },
    "max-pages": { type: "string", default: "20" },
    "max-calls": { type: "string", default: "300" },
    "dry-run": { type: "boolean", default: false },
    attachments: { type: "boolean", default: false },
    "attachments-dir": { type: "string", default: "data/attachments" },
    "attachment-concurrency": { type: "string", default: "2" },
  },
});

const log = (msg: string) => console.log(redactKey(msg));

async function main() {
  // web/.env.local 이 있으면 읽는다(이미 있는 환경변수는 덮어쓰지 않음). 값은 출력하지 않는다
  try {
    process.loadEnvFile(path.resolve(process.cwd(), ".env.local"));
  } catch {
    /* 파일 없음 */
  }
  let client: RecruitApiClient;
  if (values.source === "fixture") client = new FixtureRecruitClient();
  else if (values.source === "live") {
    if (!process.env.DATA_GO_KR_KEY) {
      console.error(
        "실제 API 수집에는 서비스키가 필요합니다.\n" +
          "  1) 공공데이터포털에서 「재정경제부_공공기관 채용정보 조회서비스」 활용신청\n" +
          "  2) web/.env.local 또는 셸 환경변수에 DATA_GO_KR_KEY=<Decoding 키> 설정 (커밋 금지)\n" +
          "  3) 다시 실행: npx tsx scripts/collect.ts --source live",
      );
      process.exit(2);
    }
    client = new DataGoKrRecruitClient({
      // 모의 서버 시험용. 운영에서는 설정하지 않는다(기본: dataGoKrConfig.ts 의 baseUrl)
      baseUrl: process.env.DATA_GO_KR_BASE_URL || undefined,
      // 일일 호출 수를 실행 간에도 누적해 개발계정 한도(1,000건)를 보호한다
      budget: new CallBudget(Number(process.env.DATA_GO_KR_DAILY_LIMIT ?? 300), path.resolve(process.cwd(), "data/.api-usage.json")),
      log,
    });
  }
  else throw new Error(`알 수 없는 source: ${values.source} (fixture | live)`);

  const outPath = path.resolve(process.cwd(), values.out!);
  const repo = values["dry-run"] ? new MemoryPostingRepository() : new JsonFilePostingRepository(outPath);
  log(`수집 시작: source=${client.name}${values["dry-run"] ? " (dry-run)" : ` → ${path.relative(process.cwd(), outPath)}`}`);

  const attachments = values.attachments
    ? new AttachmentPipeline({
        store: new LocalFileAttachmentStore(path.resolve(process.cwd(), values["attachments-dir"]!)),
        fetcher: defaultFetcher(),
        concurrency: Number(values["attachment-concurrency"]),
        log,
      })
    : undefined;

  const stats = await collect({
    client,
    repo,
    attachments,
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
  if (e instanceof DataGoKrApiError) {
    console.error(redactKey(`API 오류[${e.kind}${e.code ? `/${e.code}` : ""}]: ${e.message}`));
  } else if (e instanceof MissingServiceKeyError) {
    console.error(e.message);
  } else {
    console.error(redactKey(e instanceof Error ? `${e.name}: ${e.message}` : String(e)));
  }
  process.exit(1);
});
