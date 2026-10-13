// pdf.js 런타임 파일(본체·워커·CMap·표준 폰트)을 public/pdfjs/ 로 복사한다.
// 번들러를 거치지 않고 브라우저가 정적 파일로 직접 불러오게 해서 Next.js 번들 호환 문제를 피한다.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "pdfjs-dist");
const dest = join(root, "public", "pdfjs");

if (!existsSync(src)) {
  console.warn("[copy-pdfjs] pdfjs-dist 가 아직 설치되지 않아 건너뜁니다.");
  process.exit(0);
}
mkdirSync(dest, { recursive: true });
for (const f of ["pdf.min.mjs", "pdf.worker.min.mjs"]) {
  cpSync(join(src, "build", f), join(dest, f));
}
cpSync(join(src, "cmaps"), join(dest, "cmaps"), { recursive: true });
cpSync(join(src, "standard_fonts"), join(dest, "standard_fonts"), { recursive: true });
console.log("[copy-pdfjs] public/pdfjs 준비 완료");
