import { copyFile, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { findTool, runTool } from "./tools";

/**
 * HWP/HWPX → PDF 변환기와 PDF 텍스트 추출.
 * 경로 선택 근거: docs/hwp-conversion-check.md (pyhwp 35/35, H2Orestart 31/35)
 */
export interface ToolPaths {
  hwp5odt: string;
  soffice: string;
  pdftotext: string;
  python: string;
  /** 한컴 전용 문자 치환 스크립트 */
  puaFixScript: string;
}

export function defaultToolPaths(): ToolPaths {
  return {
    hwp5odt: process.env.HWP5ODT_BIN || "hwp5odt",
    soffice: process.env.SOFFICE_BIN || "soffice",
    pdftotext: process.env.PDFTOTEXT_BIN || "pdftotext",
    python: process.env.PYTHON_BIN || "python3",
    puaFixScript: path.join(process.cwd(), "scripts", "odt-fix-pua.py"),
  };
}

export interface ConvertResult {
  ok: boolean;
  pdfPath?: string;
  /** 사용한 경로 이름 (기록용) */
  method?: string;
  reason?: string;
}

/** 오류 메시지는 첫 줄만, 길이 제한 (경로·내부 정보가 길게 새지 않게) */
function brief(s: string): string {
  return s.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 2).join(" / ").slice(0, 200);
}

async function nonEmpty(p: string): Promise<boolean> {
  try {
    return (await stat(p)).size > 0;
  } catch {
    return false;
  }
}

/** LibreOffice 로 PDF 변환. 실행마다 별도 프로필을 써서 동시 실행 시 잠금 충돌을 피한다 */
async function sofficeToPdf(tools: ToolPaths, input: string, workDir: string, timeoutMs: number): Promise<ConvertResult> {
  const soffice = await findTool(tools.soffice);
  if (!soffice) return { ok: false, reason: "LibreOffice(soffice)가 설치되어 있지 않습니다." };
  const profile = pathToFileURL(path.join(workDir, `lo-profile-${path.basename(input)}`)).href;
  const outDir = path.join(workDir, "out");
  const r = await runTool(
    soffice,
    [`-env:UserInstallation=${profile}`, "--headless", "--norestore", "--nolockcheck", "--convert-to", "pdf", "--outdir", outDir, input],
    { timeoutMs, cwd: workDir },
  );
  const pdfPath = path.join(outDir, `${path.parse(input).name}.pdf`);
  if (await nonEmpty(pdfPath)) return { ok: true, pdfPath };
  if (r.timedOut) return { ok: false, reason: `변환 시간 초과(${Math.round(timeoutMs / 1000)}초)` };
  return { ok: false, reason: `LibreOffice 변환 실패: ${brief(r.stderr || r.stdout) || "출력 없음"}` };
}

/** 1순위: pyhwp hwp5odt → (한컴 전용 문자 치환) → LibreOffice PDF */
export async function hwpViaPyhwp(tools: ToolPaths, input: string, workDir: string, timeoutMs: number): Promise<ConvertResult> {
  const hwp5odt = await findTool(tools.hwp5odt);
  if (!hwp5odt) return { ok: false, reason: "pyhwp(hwp5odt)가 설치되어 있지 않습니다." };
  const odt = path.join(workDir, "pyhwp.odt");
  const r = await runTool(hwp5odt, ["--output", odt, input], { timeoutMs, cwd: workDir });
  if (!(await nonEmpty(odt))) {
    return { ok: false, reason: r.timedOut ? "hwp5odt 시간 초과" : `hwp5odt 실패: ${brief(r.stderr) || "출력 없음"}` };
  }
  let odtForPdf = odt;
  const python = await findTool(tools.python);
  if (python && (await nonEmpty(tools.puaFixScript))) {
    const fixed = path.join(workDir, "pyhwp-fixed.odt");
    const f = await runTool(python, ["-I", tools.puaFixScript, odt, fixed], { timeoutMs: 30_000, cwd: workDir });
    if (f.ok && (await nonEmpty(fixed))) odtForPdf = fixed; // 실패해도 원본 ODT 로 계속
  }
  const pdf = await sofficeToPdf(tools, odtForPdf, workDir, timeoutMs);
  return { ...pdf, method: "pyhwp+libreoffice" };
}

/** 2순위(HWP) / 1순위(HWPX): LibreOffice + H2Orestart 확장으로 직접 변환 */
export async function viaH2Orestart(tools: ToolPaths, input: string, ext: "hwp" | "hwpx", workDir: string, timeoutMs: number): Promise<ConvertResult> {
  // H2Orestart 는 확장자로 형식을 고르므로 올바른 확장자로 복사한다
  const named = path.join(workDir, `h2o-source.${ext}`);
  await copyFile(input, named);
  const r = await sofficeToPdf(tools, named, workDir, timeoutMs);
  if (!r.ok && r.reason?.includes("could not be loaded")) {
    return { ...r, method: "libreoffice+h2orestart", reason: `${r.reason} (H2Orestart 확장 미설치 또는 지원하지 않는 문서)` };
  }
  return { ...r, method: "libreoffice+h2orestart" };
}

export type TextStatus = "extracted" | "empty" | "unavailable" | "not-applicable";

/** PDF 텍스트 추출. 공백 제외 MIN_CHARS 미만이면 스캔본으로 보고 빈 값 처리 */
export async function extractPdfText(
  tools: ToolPaths,
  pdfPath: string,
  workDir: string,
  timeoutMs: number,
): Promise<{ status: TextStatus; text: string }> {
  const MIN_CHARS = 20;
  const bin = await findTool(tools.pdftotext);
  if (!bin) return { status: "unavailable", text: "" };
  const out = path.join(workDir, "text.txt");
  const r = await runTool(bin, ["-layout", "-enc", "UTF-8", pdfPath, out], { timeoutMs, cwd: workDir });
  if (!r.ok) return { status: "unavailable", text: "" };
  const text = (await readFile(out, "utf-8").catch(() => "")).replace(/\f/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
  return text.replace(/\s/g, "").length >= MIN_CHARS ? { status: "extracted", text } : { status: "empty", text: "" };
}
