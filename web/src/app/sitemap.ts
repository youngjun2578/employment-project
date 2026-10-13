import type { MetadataRoute } from "next";
import { SITE_URL, USE_SAMPLE } from "@/lib/config";
import { daysLeft } from "@/lib/dates";
import { institutionSlug } from "@/lib/postingQuery";
import { getRepository } from "@/lib/repository";

export const dynamic = "force-dynamic";

/** 마감 후 이 일수가 지난 공고는 sitemap 에서 뺀다 */
const CLOSED_KEEP_DAYS = 14;

/**
 * 진행 중 공고는 높은 우선순위, 최근 마감 공고는 낮은 우선순위, 오래된 마감 공고는 제외.
 * 샘플 모드에서는 가짜 데이터를 알리지 않도록 빈 sitemap 을 낸다.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (USE_SAMPLE) return [];
  const now = new Date();
  const postings = await getRepository().list({ now });
  const entries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/institutions`, changeFrequency: "daily", priority: 0.6 },
  ];
  const activeInst = new Set<string>();
  for (const p of postings) {
    const left = daysLeft(p.endDate, now);
    const closed = left !== null && left < 0;
    if (closed && left < -CLOSED_KEEP_DAYS) continue;
    if (!closed) activeInst.add(institutionSlug(p));
    entries.push({
      url: `${SITE_URL}/postings/${encodeURIComponent(p.id)}`,
      lastModified: p.meta.updatedAt,
      changeFrequency: closed ? "monthly" : "daily",
      priority: closed ? 0.1 : left !== null && left <= 3 ? 0.9 : 0.8,
    });
  }
  for (const slug of activeInst) {
    entries.push({ url: `${SITE_URL}/institutions/${encodeURIComponent(slug)}`, changeFrequency: "daily", priority: 0.5 });
  }
  return entries;
}
