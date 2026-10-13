/**
 * 첨부 형식 감지: 확장자·Content-Type 이 아니라 파일 앞부분 바이트(매직넘버)로 판별한다.
 * (잡알리오 첨부는 download.json 으로 내려와 Content-Type 을 믿을 수 없다 → docs/alio-observation.md)
 */
export type SourceFormat =
  | "pdf"
  | "png"
  | "jpeg"
  | "gif"
  | "webp"
  | "hwp" // HWP 5.0 (OLE 복합 문서 + "HWP Document File" 서명)
  | "hwpx" // ZIP + 첫 항목 mimetype = application/hwp+zip
  | "ole" // HWP 가 아닌 OLE 문서(구형 doc/xls 등)
  | "zip" // 그 밖의 ZIP (docx, 압축 묶음 등)
  | "unknown";

export interface Detection {
  format: SourceFormat;
  /** HWP 5.0 의 암호 설정 여부 (FileHeader 속성 bit 1) */
  encrypted?: boolean;
}

const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const HWP_SIGNATURE = Buffer.from("HWP Document File", "latin1");
const HWPX_MIMETYPE = "application/hwp+zip";

function startsWith(buf: Uint8Array, bytes: number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false;
  return bytes.every((b, i) => buf[offset + i] === b);
}

export function detectFormat(input: Uint8Array): Detection {
  const buf = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { format: "pdf" }; // %PDF-
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { format: "png" };
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return { format: "jpeg" };
  if (startsWith(buf, [0x47, 0x49, 0x46, 0x38])) return { format: "gif" }; // GIF8
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && buf.subarray(8, 12).toString("latin1") === "WEBP") return { format: "webp" };

  if (startsWith(buf, OLE_MAGIC)) {
    // FileHeader 스트림은 작아서 보통 미니 스트림에 들어 있다. 위치가 고정이 아니므로 서명을 찾는다.
    const at = buf.indexOf(HWP_SIGNATURE);
    if (at < 0) return { format: "ole" };
    // 서명(32바이트) + 버전(4바이트) 다음 속성 DWORD: bit0 압축, bit1 암호
    const props = buf.length >= at + 40 ? buf.readUInt32LE(at + 36) : 0;
    return { format: "hwp", encrypted: (props & 0b10) !== 0 };
  }

  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) {
    // ODF/OWPML 규칙: 첫 항목이 압축 없이 저장된 "mimetype"
    const nameLen = buf.length >= 30 ? buf.readUInt16LE(26) : 0;
    const extraLen = buf.length >= 30 ? buf.readUInt16LE(28) : 0;
    const name = buf.subarray(30, 30 + nameLen).toString("latin1");
    if (name === "mimetype") {
      const start = 30 + nameLen + extraLen;
      const mime = buf.subarray(start, start + HWPX_MIMETYPE.length).toString("latin1");
      if (mime === HWPX_MIMETYPE) return { format: "hwpx" };
    }
    return { format: "zip" };
  }
  return { format: "unknown" };
}

export const IMAGE_FORMATS: SourceFormat[] = ["png", "jpeg", "gif", "webp"];

export const FORMAT_EXTENSION: Record<SourceFormat, string> = {
  pdf: "pdf", png: "png", jpeg: "jpg", gif: "gif", webp: "webp",
  hwp: "hwp", hwpx: "hwpx", ole: "bin", zip: "zip", unknown: "bin",
};

export const FORMAT_CONTENT_TYPE: Partial<Record<SourceFormat, string>> = {
  pdf: "application/pdf", png: "image/png", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
};
