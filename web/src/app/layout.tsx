import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { SampleBanner } from "@/components/SampleBanner";
import { DATA_SOURCE_LABEL, SITE_NAME, SITE_URL, USE_SAMPLE } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
  description: "공공기관·공기업 채용공고를 한곳에서 보고, 공고문을 바로 열람하세요.",
  applicationName: SITE_NAME,
  // 샘플 모드: 가짜 데이터가 검색엔진에 올라가지 않도록 모든 페이지 noindex
  robots: USE_SAMPLE ? { index: false, follow: false, googleBot: { index: false, follow: false } } : { index: true, follow: true },
  openGraph: { siteName: SITE_NAME, locale: "ko_KR", type: "website" },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0f2557" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <SampleBanner />
        <header className="site-header">
          <div className="container">
            <Link href="/" className="site-title">{SITE_NAME}</Link>
            <span className="tagline">공공기관·공기업 채용공고 모음</span>
          </div>
        </header>
        <main className="container">{children}</main>
        <footer className="site-footer">
          <div className="container">
            <p>데이터 출처: {DATA_SOURCE_LABEL}. 공고의 수정·변경 사항은 각 기관 원문 공고를 기준으로 합니다.</p>
            <p>이 사이트는 공고 정보를 모아 보여줄 뿐이며, 지원은 각 기관 채용 페이지에서 진행됩니다.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
