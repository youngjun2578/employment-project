"use client";

import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";

type PdfJs = typeof import("pdfjs-dist");

/**
 * pdf.js 본체는 번들하지 않고 public/pdfjs/ 의 정적 파일을 브라우저가 직접 불러온다
 * (postinstall 의 scripts/copy-pdfjs.mjs 가 복사). 번들러와의 ESM/워커 호환 문제를 피하기 위함.
 */
let pdfjsPromise: Promise<PdfJs> | null = null;
function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= (import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "/pdfjs/pdf.min.mjs" as string) as Promise<PdfJs>).then(
    (lib) => {
      lib.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
      return lib;
    },
  );
  return pdfjsPromise;
}

interface Props {
  url: string;
  title: string;
  onError?: () => void;
}

/**
 * 여러 페이지 PDF 를 페이지 흐름 안에서 세로로 렌더링한다.
 * - 컨테이너 폭에 맞춰(fit-width) 그리므로 모바일에서도 가로 스크롤이 생기지 않는다.
 * - 화면 근처에 온 페이지만 그린다(IntersectionObserver). 폭이 바뀌면 다시 그린다.
 */
export function PdfViewer({ url, title, onError }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [ratio, setRatio] = useState(1.414); // 첫 페이지 높이/폭. A4 기본값
  const [width, setWidth] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  // 문서 로드
  useEffect(() => {
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;
    loadPdfJs()
      .then((lib) =>
        lib.getDocument({
          url,
          cMapUrl: "/pdfjs/cmaps/",
          cMapPacked: true,
          standardFontDataUrl: "/pdfjs/standard_fonts/",
        }).promise,
      )
      .then(async (d) => {
        loaded = d;
        if (cancelled) return;
        const first = await d.getPage(1);
        const vp = first.getViewport({ scale: 1 });
        if (cancelled) return;
        setRatio(vp.height / vp.width);
        setDoc(d);
        setState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setState("error");
        onError?.();
      });
    return () => {
      cancelled = true;
      void loaded?.destroy();
    };
  }, [url, onError]);

  // 컨테이너 폭 추적(정수 px, 리사이즈는 잠깐 모아서 반영)
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const ro = new ResizeObserver(([entry]) => {
      clearTimeout(t);
      const w = Math.floor(entry.contentRect.width);
      t = setTimeout(() => setWidth((prev) => (Math.abs(prev - w) >= 2 ? w : prev)), 120);
    });
    ro.observe(el);
    setWidth(Math.floor(el.getBoundingClientRect().width));
    return () => {
      clearTimeout(t);
      ro.disconnect();
    };
  }, []);

  return (
    <div className="pdf-viewer" ref={wrapRef} aria-label={`${title} 공고문 PDF`}>
      {state === "loading" && <p className="viewer-status">공고문을 불러오는 중입니다…</p>}
      {state === "error" && <p className="viewer-status">PDF 를 불러오지 못했습니다.</p>}
      {doc && width > 0 && (
        <>
          <p className="viewer-meta">총 {doc.numPages}쪽</p>
          {Array.from({ length: doc.numPages }, (_, i) => (
            <PdfPage key={i} doc={doc} pageNumber={i + 1} width={width} defaultRatio={ratio} />
          ))}
        </>
      )}
    </div>
  );
}

function PdfPage({ doc, pageNumber, width, defaultRatio }: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  width: number;
  defaultRatio: number;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [ratio, setRatio] = useState(defaultRatio);
  const [rendered, setRendered] = useState(false);

  // 화면 위아래 1.5 화면 안에 들어오면 그리기 시작(한 번 보이면 유지)
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "150% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || width <= 0) return;
    let cancelled = false;
    let task: ReturnType<PDFPageProxy["render"]> | null = null;
    (async () => {
      const page = await doc.getPage(pageNumber);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      setRatio(base.height / base.width);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const vp = page.getViewport({ scale: (width / base.width) * dpr });
      const canvas = canvasRef.current;
      if (!canvas) return;
      // 다른 캔버스에 그린 뒤 바꿔치기해서 리사이즈 중 깜빡임을 줄인다
      const off = document.createElement("canvas");
      off.width = Math.floor(vp.width);
      off.height = Math.floor(vp.height);
      const ctx = off.getContext("2d");
      if (!ctx) return;
      task = page.render({ canvasContext: ctx, viewport: vp });
      await task.promise;
      if (cancelled) return;
      canvas.width = off.width;
      canvas.height = off.height;
      canvas.getContext("2d")?.drawImage(off, 0, 0);
      setRendered(true);
    })().catch(() => {
      /* 취소(RenderingCancelledException) 또는 개별 페이지 오류: 자리표시만 남긴다 */
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [visible, width, doc, pageNumber]);

  return (
    <div
      ref={boxRef}
      className={`pdf-page${rendered ? " is-rendered" : ""}`}
      style={{ aspectRatio: `1 / ${ratio}` }}
      role="img"
      aria-label={`${pageNumber}쪽`}
    >
      <canvas ref={canvasRef} />
      {!rendered && <span className="pdf-page-label">{pageNumber}쪽</span>}
    </div>
  );
}
