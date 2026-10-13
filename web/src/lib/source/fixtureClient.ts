import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ListQuery, RecruitApiClient } from "./client";

/** 날짜로 취급해 이동시킬 응답 필드(샘플 전용) */
const DATE_FIELDS = ["pbancBgngYmd", "pbancEndYmd"];

export const SAMPLE_RAW_DIR = path.join(process.cwd(), "data", "sample", "raw");

function shiftYmd(v: unknown, days: number): unknown {
  if (typeof v !== "string" || !/^\d{8}$/.test(v) || days === 0) return v;
  const t = Date.UTC(+v.slice(0, 4), +v.slice(4, 6) - 1, +v.slice(6, 8)) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10).replaceAll("-", "");
}

function shiftRecord(r: unknown, days: number): unknown {
  if (!r || typeof r !== "object" || Array.isArray(r)) return r;
  const out: Record<string, unknown> = { ...(r as Record<string, unknown>) };
  for (const f of DATE_FIELDS) out[f] = shiftYmd(out[f], days);
  return out;
}

/**
 * data/sample/raw/ 의 가짜 응답을 읽는 클라이언트. 네트워크를 쓰지 않는다.
 * shiftToToday=true 면 meta.json 의 baseDate 와 오늘(KST)의 차이만큼 날짜를 밀어
 * "마감 임박", "마감 지남" 같은 케이스가 시간이 지나도 유지되게 한다.
 */
export class FixtureRecruitClient implements RecruitApiClient {
  readonly name = "fixture";
  private offsetDays: Promise<number>;

  constructor(
    private readonly dir: string = SAMPLE_RAW_DIR,
    shiftToToday = true,
    now: Date = new Date(),
  ) {
    this.offsetDays = shiftToToday ? this.computeOffset(now) : Promise.resolve(0);
  }

  private async computeOffset(now: Date): Promise<number> {
    try {
      const meta = JSON.parse(await readFile(path.join(this.dir, "meta.json"), "utf-8"));
      const b = String(meta.baseDate ?? "");
      if (!/^\d{8}$/.test(b)) return 0;
      const base = Date.UTC(+b.slice(0, 4), +b.slice(4, 6) - 1, +b.slice(6, 8));
      const kst = new Date(now.getTime() + 9 * 3_600_000);
      const today = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate());
      return Math.round((today - base) / 86_400_000);
    } catch {
      return 0;
    }
  }

  async fetchList({ pageNo, numOfRows }: ListQuery): Promise<unknown> {
    const body = JSON.parse(await readFile(path.join(this.dir, "list.json"), "utf-8"));
    const days = await this.offsetDays;
    const all: unknown[] = Array.isArray(body.result) ? body.result : [];
    const start = (pageNo - 1) * numOfRows;
    // ongoingOnly 는 일부러 무시: 마감된 샘플도 내려줘서 "마감 처리" 흐름을 시험한다
    return { ...body, result: all.slice(start, start + numOfRows).map((r) => shiftRecord(r, days)) };
  }

  async fetchDetail(sn: string): Promise<unknown | null> {
    if (!/^[\w-]+$/.test(sn)) return null; // 경로 조작 방지
    try {
      const body = JSON.parse(await readFile(path.join(this.dir, "detail", `${sn}.json`), "utf-8"));
      return { ...body, result: shiftRecord(body.result, await this.offsetDays) };
    } catch {
      return null;
    }
  }
}
