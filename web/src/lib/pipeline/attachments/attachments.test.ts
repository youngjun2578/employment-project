import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { defaultToolPaths } from "./converters";
import { detectFormat } from "./detect";
import { localSampleFetcher } from "./fetchers";
import { AttachmentPipeline, FileTooLargeError, type AttachmentFetcher } from "./index";
import { assertSafeKey, LocalFileAttachmentStore } from "./store";
import { findTool, Limiter, runTool } from "./tools";

const PUBLIC = path.join(process.cwd(), "public");
const HWP_DIR = path.join(process.cwd(), "test-fixtures", "hwp");
const hwp = (n: string) => path.join(HWP_DIR, n);

/** "mimetype" 을 첫 항목으로 저장한 최소 ZIP 앞부분 (형식 감지용) */
function storedZipHead(name: string, content: string): Buffer {
  const n = Buffer.from(name, "latin1");
  const c = Buffer.from(content, "latin1");
  const h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50, 0);
  h.writeUInt16LE(n.length, 26);
  h.writeUInt16LE(0, 28);
  return Buffer.concat([h, n, c]);
}

describe("형식 감지(매직넘버)", () => {
  test("샘플 PDF·PNG, 확장자와 무관", async () => {
    assert.equal(detectFormat(await readFile(path.join(PUBLIC, "sample-docs/sample-notice-900001.pdf"))).format, "pdf");
    assert.equal(detectFormat(await readFile(path.join(PUBLIC, "sample-docs/sample-notice-900002.png"))).format, "png");
  });
  test("JPEG·GIF·HWPX·ZIP·OLE·알 수 없음", () => {
    assert.equal(detectFormat(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])).format, "jpeg");
    assert.equal(detectFormat(Buffer.from("GIF89a....")).format, "gif");
    assert.equal(detectFormat(storedZipHead("mimetype", "application/hwp+zip")).format, "hwpx");
    assert.equal(detectFormat(storedZipHead("mimetype", "application/vnd.oasis.opendocument.text")).format, "zip");
    assert.equal(detectFormat(storedZipHead("word/document.xml", "<x/>")).format, "zip");
    assert.equal(detectFormat(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0])).format, "ole");
    assert.equal(detectFormat(Buffer.from("<!DOCTYPE html>")).format, "unknown");
    assert.equal(detectFormat(new Uint8Array()).format, "unknown");
  });
  test("HWP 5.0 과 암호 여부", { skip: !existsSync(hwp("sample-5017.hwp")) && "scripts/fetch-hwp-fixtures.sh 미실행" }, async () => {
    assert.deepEqual(detectFormat(await readFile(hwp("sample-5017.hwp"))), { format: "hwp", encrypted: false });
    assert.deepEqual(detectFormat(await readFile(hwp("password-12345.hwp"))), { format: "hwp", encrypted: true });
  });
});

describe("안전장치", () => {
  test("저장 키 검증(경로 조작 차단)", () => {
    for (const bad of ["../x", "a/../b", "/abs", "a//b", "a b", "a\\b", ""]) assert.throws(() => assertSafeKey(bad), bad);
    assertSafeKey("900001/0-abc.pdf");
  });
  test("외부 도구는 인자 배열로 실행(셸 해석 없음)·시간 제한", async () => {
    const r = await runTool("node", ["-e", "process.stdout.write(process.argv[1])", "$(echo hacked); `id`"], { timeoutMs: 10_000 });
    assert.equal(r.stdout, "$(echo hacked); `id`");
    const slow = await runTool("node", ["-e", "setTimeout(()=>{}, 5000)"], { timeoutMs: 300 });
    assert.equal(slow.ok, false);
    assert.equal(slow.timedOut, true);
  });
  test("동시 실행 수 제한", async () => {
    const lim = new Limiter(2);
    let active = 0;
    let peak = 0;
    await Promise.all(Array.from({ length: 6 }, () => lim.run(async () => {
      peak = Math.max(peak, ++active);
      await new Promise((r) => setTimeout(r, 20));
      active--;
    })));
    assert.equal(peak, 2);
  });
});

describe("파이프라인", () => {
  let root: string;
  let store: LocalFileAttachmentStore;
  const fetchLocal = localSampleFetcher(PUBLIC);
  /** 샘플 경로는 public/, "file:" 은 로컬 파일 */
  const fetcher: AttachmentFetcher = async (url, max) =>
    url.startsWith("file:") ? new Uint8Array(await readFile(url.slice(5))) : fetchLocal(url, max);

  before(async () => {
    root = await mkdtemp(path.join(tmpdir(), "attach-test-"));
    store = new LocalFileAttachmentStore(root);
  });
  after(async () => rm(root, { recursive: true, force: true }));

  const pipe = (o: Partial<ConstructorParameters<typeof AttachmentPipeline>[0]> = {}) =>
    new AttachmentPipeline({ store, fetcher, timeoutMs: 120_000, ...o });

  test("이미지는 그대로 저장", async () => {
    const r = await pipe().process({ postingId: "900002", index: 0, fileName: "x.png", sourceUrl: "/sample-docs/sample-notice-900002.png" });
    assert.equal(r.status, "success");
    assert.equal(r.viewFormat, "image");
    assert.match(r.viewUrl!, /^\/files\/900002\/0-[0-9a-f]{12}\.png$/);
    assert.equal(r.textStatus, "not-applicable");
    assert.ok(await store.exists(r.viewUrl!.replace("/files/", "")));
  });

  test("PDF 는 그대로 저장 + 텍스트 추출", async () => {
    const r = await pipe().process({ postingId: "900001", index: 0, fileName: "a.pdf", sourceUrl: "/sample-docs/sample-notice-900001.pdf" });
    assert.equal(r.status, "success");
    assert.equal(r.viewFormat, "pdf");
    assert.equal(r.method, "passthrough");
    if ((await findTool("pdftotext")) === null) {
      assert.equal(r.textStatus, "unavailable");
    } else {
      assert.equal(r.textStatus, "extracted");
      const text = await readFile(path.join(root, r.textUrl!.replace("/files/", "")), "utf-8");
      assert.match(text, /채용 분야 및 인원/);
    }
  });

  test("원본 없음·크기 초과·미지원 형식은 예외 없이 실패 기록", async () => {
    const missing = await pipe().process({ postingId: "1", index: 0, fileName: "x.hwp", sourceUrl: "/sample-docs/none.hwp" });
    assert.equal(missing.status, "failed");
    assert.match(missing.reason!, /원본을 받지 못했습니다/);

    const big = await pipe({ maxBytes: 1000 }).process({ postingId: "1", index: 1, fileName: "a.pdf", sourceUrl: "/sample-docs/sample-notice-900001.pdf" });
    assert.equal(big.status, "failed");
    assert.match(big.reason!, /너무 큽니다/);

    const zip = await pipe({ fetcher: async () => storedZipHead("a.txt", "hello") }).process({ postingId: "1", index: 2, fileName: "a.zip", sourceUrl: "x" });
    assert.equal(zip.status, "unsupported");
    assert.equal(zip.sourceFormat, "zip");

    const thrower = await pipe({ fetcher: async () => { throw new FileTooLargeError(); } }).process({ postingId: "1", index: 3, fileName: "a", sourceUrl: "x" });
    assert.match(thrower.reason!, /너무 큽니다/);
  });

  test("깨진 HWP(서명만 있는 OLE)는 실패로 기록되고 다음 처리가 계속됨", async (t) => {
    if (!(await hasHwpTools())) return t.skip("pyhwp/LibreOffice 없음");
    const broken = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(100), Buffer.from("HWP Document File"), Buffer.alloc(40)]);
    const p = pipe({ fetcher: async (url, max) => (url === "broken" ? broken : fetcher(url, max)) });
    const [bad, good] = await Promise.all([
      p.process({ postingId: "b", index: 0, fileName: "x.hwp", sourceUrl: "broken" }),
      p.process({ postingId: "b", index: 1, fileName: "y.png", sourceUrl: "/sample-docs/sample-notice-900002.png" }),
    ]);
    assert.equal(bad.status, "failed");
    assert.equal(bad.sourceFormat, "hwp");
    assert.ok(bad.reason);
    assert.equal(good.status, "success");
  });

  test("암호 걸린 HWP 는 변환 시도 없이 실패", { skip: !existsSync(hwp("password-12345.hwp")) && "샘플 없음" }, async () => {
    const r = await pipe().process({ postingId: "p", index: 0, fileName: "x.hwp", sourceUrl: `file:${hwp("password-12345.hwp")}` });
    assert.equal(r.status, "failed");
    assert.match(r.reason!, /암호/);
  });

  test("HWP → PDF 변환(pyhwp 1순위) + 표 내용 텍스트 추출 + 한컴 전용 문자 치환", async (t) => {
    if (!existsSync(hwp("sample-5017.hwp"))) return t.skip("샘플 없음: scripts/fetch-hwp-fixtures.sh");
    if (!(await hasHwpTools())) return t.skip("pyhwp/LibreOffice 없음");
    const r = await pipe().process({ postingId: "h", index: 0, fileName: "x.hwp", sourceUrl: `file:${hwp("sample-5017.hwp")}` });
    assert.equal(r.status, "success", r.reason ?? "");
    assert.equal(r.viewFormat, "pdf");
    assert.equal(r.method, "pyhwp+libreoffice");
    const pdf = await readFile(path.join(root, r.viewUrl!.replace("/files/", "")));
    assert.equal(detectFormat(pdf).format, "pdf");
    if (r.textStatus === "extracted") {
      const text = await readFile(path.join(root, r.textUrl!.replace("/files/", "")), "utf-8");
      assert.match(text, /B10/); // 표 안의 값
      assert.match(text, /한글 워드 프로세서/); // U+F53A → "한" 치환
      assert.doesNotMatch(text, //);
    }
  });

  test("pyhwp 가 없으면 H2Orestart 로 대체", async (t) => {
    if (!existsSync(hwp("table.hwp"))) return t.skip("샘플 없음: scripts/fetch-hwp-fixtures.sh");
    if (!(await findTool("soffice"))) return t.skip("LibreOffice 없음");
    const tools = { ...defaultToolPaths(), hwp5odt: "/nonexistent/hwp5odt" };
    const r = await pipe({ tools }).process({ postingId: "t", index: 0, fileName: "x.hwp", sourceUrl: `file:${hwp("table.hwp")}` });
    if (r.status === "success") {
      assert.equal(r.method, "libreoffice+h2orestart");
    } else {
      // H2Orestart 미설치 환경: 두 경로의 실패 사유가 모두 기록돼야 한다
      assert.match(r.reason!, /pyhwp.*→.*h2orestart/i);
    }
  });
});

async function hasHwpTools(): Promise<boolean> {
  const t = defaultToolPaths();
  return !!(await findTool(t.hwp5odt)) && !!(await findTool(t.soffice));
}
