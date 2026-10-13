import { createHash } from "node:crypto";
import { daysLeft } from "../dates";
import { dedupeKey, toPosting, unwrapDetail, unwrapList } from "../mapper";
import type { PostingRepository } from "../repository/types";
import type { AttachmentPipeline } from "../pipeline/attachments";
import type { RecruitApiClient } from "../source/client";
import type { Attachment, AttachmentType, Posting, StoredPosting } from "../types";

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
  /** 주면 첨부를 받아 변환·저장한다(수집 단계). 없으면 건너뜀 */
  attachments?: AttachmentPipeline;
  /** 변환할 첨부 유형 (기본: 공고문 A) */
  attachmentTypes?: AttachmentType[];
}

export interface AttachmentStats {
  processed: number;
  converted: number;
  failed: number;
  unsupported: number;
  /** 원본 URL 이 같고 이전에 처리한 결과를 재사용 */
  reused: number;
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
  attachments: AttachmentStats | null;
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
    unchanged: 0, missing: 0, closed: 0, pruned: 0, total: 0, hitCallLimit: false, attachments: null,
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

  // 5) 첨부 변환·저장 (공고 내용 해시에는 넣지 않는다)
  if (opts.attachments) {
    stats.attachments = await processAttachments(out, existing, opts.attachments, opts.attachmentTypes ?? ["A"], log);
  }

  // 6) 저장
  await repo.saveAll(out, { source: client.name });
  return stats;
}

function stripMeta(p: StoredPosting): Posting {
  const { meta, ...rest } = p;
  void meta;
  // 변환 결과는 공고 내용이 아니므로 해시 비교에서 빼기 위해 지운다(첨부 단계에서 다시 붙음)
  return { ...rest, attachments: rest.attachments.map(withoutConversion) };
}

function withoutConversion(a: Attachment): Attachment {
  const { conversion, ...rest } = a;
  void conversion;
  return rest;
}

/**
 * 목록에 있는 공고의 첨부를 변환한다. 이전 결과가 있고 원본 URL 이 같으며 실패가 아니면 재사용.
 * 실패는 다음 수집 때 다시 시도한다. 하나가 실패해도 나머지는 계속한다.
 */
async function processAttachments(
  postings: StoredPosting[],
  existing: Map<string, StoredPosting>,
  pipeline: AttachmentPipeline,
  types: AttachmentType[],
  log: (msg: string) => void,
): Promise<AttachmentStats> {
  const st: AttachmentStats = { processed: 0, converted: 0, failed: 0, unsupported: 0, reused: 0 };
  const jobs: Promise<void>[] = [];
  for (const p of postings) {
    if (p.meta.sourceState !== "listed") continue;
    const prev = existing.get(p.meta.dedupeKey);
    p.attachments.forEach((a, index) => {
      if (!types.includes(a.type) || !a.sourceUrl) return;
      const old = prev?.attachments.find((x) => x.sourceUrl === a.sourceUrl)?.conversion;
      if (old && old.status !== "failed") {
        a.conversion = old;
        st.reused++;
        return;
      }
      jobs.push(
        pipeline.process({ postingId: p.id, index, fileName: a.fileName, sourceUrl: a.sourceUrl }).then((rec) => {
          a.conversion = rec;
          st.processed++;
          if (rec.status === "success") st.converted++;
          else if (rec.status === "unsupported") st.unsupported++;
          else st.failed++;
          if (rec.status !== "success") log(`첨부 ${rec.status}(${p.id}#${index} ${rec.sourceFormat}): ${rec.reason}`);
        }),
      );
    });
  }
  await Promise.all(jobs); // 동시 실행 수는 pipeline 의 Limiter 가 제한
  return st;
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
