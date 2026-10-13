import { createHash } from "node:crypto";
import { daysLeft } from "../dates";
import { dedupeKey, toPosting, unwrapDetail, unwrapList } from "../mapper";
import type { PostingRepository } from "../repository/types";
import type { RecruitApiClient } from "../source/client";
import type { Posting, StoredPosting } from "../types";

export interface CollectOptions {
  client: RecruitApiClient;
  repo: PostingRepository;
  now?: Date;
  numOfRows?: number;
  maxPages?: number;
  /** API 호출 상한(목록+상세). 개발계정 1일 1,000건 보호용 */
  maxCalls?: number;
  /** 마감 후 이 일수가 지난 공고는 저장소에서 정리 */
  retainClosedDays?: number;
  log?: (msg: string) => void;
}

export interface CollectStats {
  source: string;
  calls: number;
  listed: number;
  skippedInvalid: number;
  duplicates: number;
  created: number;
  updated: number;
  unchanged: number;
  /** 이번 목록에서 사라진 기존 공고 */
  missing: number;
  /** 저장 후 마감 상태인 공고 */
  closed: number;
  pruned: number;
  total: number;
  hitCallLimit: boolean;
}

/** meta 를 제외한 공고 내용의 해시. 바뀌었는지 판단용 */
export function contentHash(p: Posting): string {
  return createHash("sha256").update(JSON.stringify(p)).digest("hex").slice(0, 16);
}

/**
 * 수집 흐름: API 호출 → mapper 정규화 → 기관+공고번호 기준 중복 제거 → 변경·마감 상태 갱신 → 저장
 */
export async function collect(opts: CollectOptions): Promise<CollectStats> {
  const { client, repo } = opts;
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  const numOfRows = opts.numOfRows ?? 100;
  const maxPages = opts.maxPages ?? 20;
  const maxCalls = opts.maxCalls ?? 300;
  const retainClosedDays = opts.retainClosedDays ?? 180;
  const log = opts.log ?? (() => {});

  const stats: CollectStats = {
    source: client.name, calls: 0, listed: 0, skippedInvalid: 0, duplicates: 0, created: 0, updated: 0,
    unchanged: 0, missing: 0, closed: 0, pruned: 0, total: 0, hitCallLimit: false,
  };
  const canCall = () => {
    if (stats.calls >= maxCalls) stats.hitCallLimit = true;
    return !stats.hitCallLimit;
  };

  // 1) 목록 수집
  const items: Record<string, unknown>[] = [];
  for (let pageNo = 1; pageNo <= maxPages && canCall(); pageNo++) {
    stats.calls++;
    const { items: page, totalCount } = unwrapList(await client.fetchList({ pageNo, numOfRows, ongoingOnly: true }));
    items.push(...page);
    log(`목록 ${pageNo}쪽: ${page.length}건 (전체 ${totalCount ?? "?"})`);
    if (page.length < numOfRows || (totalCount !== null && pageNo * numOfRows >= totalCount)) break;
  }
  stats.listed = items.length;

  // 2) 상세 + 정규화 + 3) 중복 제거
  const existing = new Map((await repo.list()).map((p) => [p.meta.dedupeKey, p]));
  const fresh = new Map<string, Posting>();
  for (const item of items) {
    const listOnly = toPosting(item);
    if (!listOnly) {
      stats.skippedInvalid++;
      continue;
    }
    const key = dedupeKey(listOnly);
    if (fresh.has(key)) {
      stats.duplicates++;
      continue;
    }
    let detail: unknown = null;
    if (canCall()) {
      stats.calls++;
      detail = await client.fetchDetail(listOnly.sourceSn).catch((e: unknown) => {
        log(`상세 실패(${listOnly.sourceSn}): ${e instanceof Error ? e.message : String(e)}`);
        return null;
      });
    }
    // 상세를 못 받았으면 기존 저장본의 상세 필드를 잃지 않도록 기존 값을 유지한다
    const prev = existing.get(key);
    const p = detail ? toPosting(item, unwrapDetail(detail)) : prev ? { ...stripMeta(prev), ...pickListFields(listOnly) } : listOnly;
    if (p) fresh.set(key, p);
  }

  // 4) 변경·마감 상태 갱신
  const out: StoredPosting[] = [];
  for (const [key, p] of fresh) {
    const hash = contentHash(p);
    const prev = existing.get(key);
    if (!prev) stats.created++;
    else if (prev.meta.contentHash !== hash) stats.updated++;
    else stats.unchanged++;
    out.push({
      ...p,
      meta: {
        dedupeKey: key,
        firstSeenAt: prev?.meta.firstSeenAt ?? nowIso,
        lastSeenAt: nowIso,
        updatedAt: !prev || prev.meta.contentHash !== hash ? nowIso : prev.meta.updatedAt,
        contentHash: hash,
        sourceState: "listed",
      },
    });
  }
  for (const [key, prev] of existing) {
    if (fresh.has(key)) continue;
    // 진행중 목록에서 빠진 공고: 마감됐거나 기관이 내렸을 수 있다. 바로 지우지 않고 표시만 한다
    const left = daysLeft(prev.endDate, now);
    if (left !== null && left < -retainClosedDays) {
      stats.pruned++;
      continue;
    }
    stats.missing++;
    out.push({ ...prev, meta: { ...prev.meta, sourceState: "missing" } });
  }
  stats.closed = out.filter((p) => {
    const left = daysLeft(p.endDate, now);
    return left !== null && left < 0;
  }).length;
  stats.total = out.length;

  // 5) 저장
  await repo.saveAll(out, { source: client.name });
  return stats;
}

function stripMeta(p: StoredPosting): Posting {
  const { meta, ...rest } = p;
  void meta;
  return rest;
}

/** 목록에서 오는 값(제목·기간 등)은 최신 목록 값으로 덮는다 */
function pickListFields(p: Posting): Partial<Posting> {
  const out: Partial<Posting> = {};
  for (const [k, v] of Object.entries(p) as [keyof Posting, Posting[keyof Posting]][]) {
    const empty = v === null || (Array.isArray(v) && v.length === 0) || v === "(제목 없음)" || v === "기관명 미상";
    if (!empty) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}
