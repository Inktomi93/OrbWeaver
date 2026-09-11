// infra/extraction/loaders/pdf.ts — the pdf loader (pdfjs-dist). THE long pole. Server-side, DOM-less,
// WORKER-LESS: the default build needs a DOM (DOMMatrix) and is rejected under node — the `legacy` build runs
// on the main thread with a fake worker (no `GlobalWorkerOptions.workerSrc` set) and reads text content only,
// never rasterizing (no canvas/fonts needed for `getTextContent`). Verified extracting under plain node 24.
//
// Text assembly: per page, text items joined with spaces, `hasEOL` items end a line, lines joined
// `\n`; pages joined `\n\n`. `pageCount` from the document; `title` from the info-dict when present. Encrypted
// / corrupt / truncated pdfs throw (PasswordException / InvalidPDFException) — the dispatch wraps them as
// ExtractionFailedError. Empty text is truthful (a scanned image-only pdf has no text layer; no OCR).

import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { RawExtraction } from "../loader.ts";

// DERIVED from the public surface, not reached in through `pdfjs-dist/types/src/display/api` (a private
// subpath the package's own exports map does not publish — legal under `bundler`, a hard resolution error
// under `nodenext`, tsx-shedding stage 4). `getTextContent().items` IS the union we care about, so taking
// it from the return type keeps us honest to the version actually installed.
type TextContentItem = Awaited<ReturnType<PDFPageProxy["getTextContent"]>>["items"][number];
type TextItem = Extract<TextContentItem, { readonly str: string }>;
type TextMarkedContent = Exclude<TextContentItem, TextItem>;

const PAGE_SEPARATOR = "\n\n";
const LINE_SEPARATOR = "\n";
const ITEM_SEPARATOR = " ";

/** A text-content item that carries a string (vs a `TextMarkedContent` structural marker). */
function isTextItem(item: TextItem | TextMarkedContent): item is TextItem {
  return "str" in item;
}

/** Assemble one page's text items: space-join items on a line, break the line on `hasEOL`, join lines `\n`. */
function assemblePage(items: readonly (TextItem | TextMarkedContent)[]): string {
  const lines: string[] = [];
  let line: string[] = [];
  for (const item of items) {
    if (!isTextItem(item)) {
      continue;
    }
    line.push(item.str);
    if (item.hasEOL) {
      lines.push(line.join(ITEM_SEPARATOR));
      line = [];
    }
  }
  if (line.length > 0) {
    lines.push(line.join(ITEM_SEPARATOR));
  }
  return lines.join(LINE_SEPARATOR);
}

/** The info-dict `Title`, trimmed, when present + non-empty. A metadata read failure never fails extraction. */
async function readTitle(doc: PDFDocumentProxy): Promise<string | undefined> {
  let info: object = {};
  // @orb-waive caught-failure-ownership(catch): a PDF metadata read failure collapses to "no title" — no credential/auth/crypto path, the title is derived display-only content, so a malformed info dict can never fail extraction or leak. Ends if getMetadata()'s result ever gates a security decision.
  try {
    ({ info } = await doc.getMetadata());
  } catch {
    // A metadata read failure must never fail extraction — treat it as "no title".
  }
  const raw = (info as Record<string, unknown>)["Title"];
  const title = typeof raw === "string" ? raw.trim() : "";
  return title.length > 0 ? title : undefined;
}

export async function loadPdf(bytes: Uint8Array): Promise<RawExtraction> {
  // A COPY: pdfjs takes ownership of `data` and may detach the backing ArrayBuffer — never hand it the
  // caller's buffer. `verbosity: 0` silences pdfjs's console warnings (missing standard-font data is
  // irrelevant to text extraction). The loading TASK owns teardown (`destroy`), not the document proxy.
  const task = getDocument({ data: new Uint8Array(bytes), verbosity: 0 });
  try {
    const doc = await task.promise;
    const pageCount = doc.numPages;
    const pages: string[] = [];
    for (let n = 1; n <= pageCount; n += 1) {
      const page = await doc.getPage(n);

      const content = await page.getTextContent();
      pages.push(assemblePage(content.items));
      page.cleanup();
    }
    const text = pages.join(PAGE_SEPARATOR);
    const title = await readTitle(doc);
    return title === undefined ? { text, pageCount } : { text, pageCount, title };
  } finally {
    await task.destroy();
  }
}
