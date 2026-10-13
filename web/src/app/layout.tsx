import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { SampleBanner } from "@/components/SampleBanner";
import { DATA_SOURCE_LABEL, SITE_NAME, SITE_URL, USE_SAMPLE } from "@/lib/config";
import "./tokens.css";
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
        <a className="skip-link" href="#main">본문으로 건너뛰기</a>
        <SampleBanner />
        <header className="site-header">
          <div className="container site-header-inner">
            <Link href="/" className="site-brand">
              <span className="site-mark" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18"><path d="M5 7h14M5 12h14M5 17h9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
              </span>
              <span className="site-title">{SITE_NAME}</span>
            </Link>
            <nav className="site-nav" aria-label="주요 메뉴">
              <Link href="/#list" className="nav-wide">전체 공고</Link>
              <Link href="/institutions">기관별</Link>
            </nav>
          </div>
        </header>
        <main id="main" className="container">{children}</main>
        <footer className="site-footer">
          <div className="container">
            <p className="footer-brand">{SITE_NAME}</p>
            <p>공공기관·공기업 채용공고를 모아 보여주는 서비스입니다. 지원은 각 기관 채용 페이지에서 진행됩니다.</p>
            <dl className="footer-meta">
              <div><dt>데이터 출처</dt><dd>{DATA_SOURCE_LABEL}</dd></div>
              <div><dt>유의 사항</dt><dd>공고의 수정·변경 사항은 각 기관 원문 공고를 기준으로 합니다. 이 사이트의 정보는 원문과 다를 수 있습니다.</dd></div>
            </dl>
          </div>
        </footer>
      </body>
    </html>
  );
}
