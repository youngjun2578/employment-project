import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 서버에서 fs 로 읽는 JSON 데이터가 Vercel 서버리스 번들에 포함되도록 명시
  outputFileTracingIncludes: {
    "/**": ["./data/**/*.json"],
  },
};

export default nextConfig;
