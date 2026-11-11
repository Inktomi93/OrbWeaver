// infra/extraction/loaders/pdf.ts — the pdf loader (pdfjs-dist). THE long pole. Server-side, DOM-less,
// WORKER-LESS: the default build needs a DOM (DOMMatrix) and is rejected under node — the `legacy` build runs
// on the main thread with a fake worker (no `GlobalWorkerOptions.workerSrc` set) and reads text content only,
// never rasterizing (no canvas/fonts needed for `getTextContent`). Verified extracting under plain node 24.
//
// Text assembly: per page, text items concatenated, `hasEOL` items end a line, lines joined `\n`; pages joined
// `\n\n`. pdfjs states a gap AHEAD of the previous item as a space character, inside an item's `str` or as a
// whitespace-only item of its own, and closes a line with an empty `hasEOL` item after a font change; a separator
// of ours on every join adds a space the page does not draw. One layout carries no space from pdfjs: a left-to-right
// run that starts BEHIND the previous item's end on the same line (words drawn out of order) gets one space from us.
// Right-to-left runs are left as pdfjs gives them. `pageCount` from the document; `title` from the info-dict when present. Encrypted
// / corrupt / truncated pdfs throw (PasswordException / InvalidPDFException) — the dispatch wraps them as
// ExtractionFailedError. Empty text is truthful (a scanned image-only pdf has no text layer; no OCR).

import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { RawExtraction } from "../contract.ts";

// DERIVED from the public surface, not reached in through `pdfjs-dist/types/src/display/api` (a private
// subpath the package's own exports map does not publish — legal under `bundler`, a hard resolution error
// under `nodenext`, tsx-shedding stage 4). `getTextContent().items` IS the union we care about, so taking
// it from the return type keeps us honest to the version actually installed.
type TextContentItem = Awaited<ReturnType<PDFPageProxy["getTextContent"]>>["items"][number];
type TextItem = Extract<TextContentItem, { readonly str: string }>;
type TextMarkedContent = Exclude<TextContentItem, TextItem>;

const PAGE_SEPARATOR = "\n\n";
const LINE_SEPARATOR = "\n";
const WORD_SEPARATOR = " ";
/** pdfjs's `dir` for text it reads left to right. */
const LEFT_TO_RIGHT = "ltr";
/** How far, in ems, a run must start behind the previous item's end for pdfjs to cut the item there with no space
 *  item: its own threshold for a backward move, so a smaller overlap is kerning and gets no separator from us. */
const BACKWARD_JUMP_EM = 0.2;
const ENDS_WITH_SPACE = /\s$/u;
const STARTS_WITH_SPACE = /^\s/u;

/** A text-content item that carries a string (vs a `TextMarkedContent` structural marker). */
function isTextItem(item: TextItem | TextMarkedContent): item is TextItem {
  return "str" in item;
}

/** How far `item` starts past the end of `previous`, measured along `previous`'s baseline in the page's units; negative
 *  when it starts behind that end. The baseline direction is the first row of the text matrix, so rotated text measures
 *  along its own line. */
function advanceFrom(previous: TextItem, item: TextItem): number {
  const [a = 0, b = 0, , , previousX = 0, previousY = 0] = previous.transform.map(Number);
  const [, , , , itemX = 0, itemY = 0] = item.transform.map(Number);
  return ((itemX - previousX) * a + (itemY - previousY) * b) / Math.hypot(a, b) - previous.width;
}

/** Whether a word break is owed between the line so far and `item`, the next item on it. Only a left-to-right run that
 *  starts behind `previous` needs one; every other gap is already spelled in the items. Items on one line share a
 *  baseline because pdfjs ends the line with `hasEOL` when the next run sits on another. */
function startsBehind(line: string, previous: TextItem, item: TextItem): boolean {
  if (item.str.length === 0 || ENDS_WITH_SPACE.test(line) || STARTS_WITH_SPACE.test(item.str)) {
    return false;
  }
  return previous.dir === LEFT_TO_RIGHT && item.dir === LEFT_TO_RIGHT && advanceFrom(previous, item) < -BACKWARD_JUMP_EM * previous.height;
}

/** Assemble one page's text items: concatenate the items of a line, break the line on `hasEOL`, join lines `\n`. */
function assemblePage(items: readonly (TextItem | TextMarkedContent)[]): string {
  const lines: string[] = [];
  let line = "";
  let previous: TextItem | undefined;
  for (const item of items) {
    if (!isTextItem(item)) {
      continue;
    }
    if (previous !== undefined && startsBehind(line, previous, item)) {
      line += WORD_SEPARATOR;
    }
    line += item.str;
    if (item.str.length > 0) {
      previous = item;
    }
    if (item.hasEOL) {
      lines.push(line);
      line = "";
      previous = undefined;
    }
  }
  if (line.length > 0) {
    lines.push(line);
  }
  return lines.join(LINE_SEPARATOR);
}

/** The info-dict `Title`, trimmed, when present + non-empty. A metadata read failure never fails extraction. */
async function readTitle(doc: PDFDocumentProxy): Promise<string | undefined> {
  let info: object = {};
  // a PDF metadata read failure collapses to "no title" — no credential/auth/crypto path, the title is derived display-only content, so a malformed info dict can never fail extraction or leak. Ends if getMetadata()'s result ever gates a security decision.
  try {
    ({ info } = await doc.getMetadata());
  } catch {
    // A metadata read failure must never fail extraction — treat it as "no title".
  }
  const raw = (info as Record<string, unknown>)["Title"];
  const title = typeof raw === "string" ? raw.trim() : "";
  return title.length > 0 ? title : undefined;
}

export async function loadPdf(bytes: Uint8Array): Promise<RawExtraction & { readonly pageCount: number }> {
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
