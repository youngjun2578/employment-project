import type { MetadataRoute } from "next";
import { SITE_URL, USE_SAMPLE } from "@/lib/config";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  // 샘플 모드(프리뷰 배포 포함)는 전체 차단
  if (USE_SAMPLE) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/files/"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
