// infra/extraction/loaders/docx.ts — the docx loader (databank-design/04 §2, fast-follow). A .docx is a ZIP of
// OOXML; the body text lives in `word/document.xml` as `<w:t>` runs nested in `<w:p>` paragraphs. We UNZIP with
// fflate (already the tree's isomorphic zero-dep unzip — the plugin bundle uses the same `unzipSync`) and pull
// the paragraph text directly, rather than vendoring mammoth: the design's §5 mammoth pick predates fflate
// landing for plugin-host, and a second unzip lib for a light text pull is exactly the dep the global rule bans.
// Output parity with mammoth's `extractRawText`: each `<w:p>` becomes one line, runs (`<w:t>`) concatenated,
// `<w:tab>`/`<w:br>` → whitespace, paragraphs joined `\n\n` (the chunker's boundary; normalize.ts collapses runs).
//
// UNTRUSTED bytes (an upload boundary), so a decompression-bomb guard caps the declared entry size BEFORE fflate
// allocates (the plugin-host `unzipHardened` precedent). A corrupt zip / missing document part throws — the
// dispatch wraps it as `ExtractionFailedError('docx')`. Empty text is truthful (a doc with no runs).

import type { UnzipFileInfo } from "fflate";
import { strFromU8, unzipSync } from "fflate";
import type { RawExtraction } from "../loader";

const DOCUMENT_PART = "word/document.xml";
// A single OOXML part over 64 MiB is a bomb, not a document — refuse from the zip header before allocating.
const MAX_PART_BYTES = 67_108_864;

/** A `<w:p>` paragraph (the smallest unit we join with a blank line). */
const PARAGRAPH = /<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g;
/** The in-paragraph tokens that carry text or whitespace, in document order: a `<w:t>` text run (`xml:space`
 *  keeps leading/trailing spaces — we do not trim), a `<w:tab/>` (→ tab), or a `<w:br/>`/`<w:cr/>` (→ newline).
 *  Matched together so their DOCUMENT ORDER is preserved (a tab between two runs stays between them). */
const PARAGRAPH_TOKEN = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/?>|<w:(?:br|cr)\b[^>]*\/?>/g;
/** The five predefined XML entities `<w:t>` text can carry. */
const XML_ENTITIES: Readonly<Record<string, string>> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };
const XML_ENTITY = /&(?:amp|lt|gt|quot|apos);/g;

function decodeXml(raw: string): string {
  return raw.replace(XML_ENTITY, (m) => XML_ENTITIES[m] ?? m);
}

/** Concatenate a paragraph's tokens into its line, in document order: `<w:t>` → its decoded text, `<w:tab>` →
 *  a tab, `<w:br>`/`<w:cr>` → a newline. */
function paragraphText(inner: string): string {
  const parts: string[] = [];
  for (const match of inner.matchAll(PARAGRAPH_TOKEN)) {
    const [token, runText] = match;
    if (runText !== undefined) {
      parts.push(decodeXml(runText));
    } else if (token.startsWith("<w:tab")) {
      parts.push("\t");
    } else {
      parts.push("\n");
    }
  }
  return parts.join("");
}

/** Refuse an over-cap entry from the zip header BEFORE fflate allocates its output (the bomb guard) — only the
 *  one part we read is decompressed at all. */
function documentFilter(file: UnzipFileInfo): boolean {
  if (file.name !== DOCUMENT_PART) {
    return false;
  }
  if (file.originalSize > MAX_PART_BYTES) {
    throw new Error(`docx ${DOCUMENT_PART} exceeds the ${MAX_PART_BYTES}-byte cap`);
  }
  return true;
}

// A sync body wrapped in `Promise.resolve` (the html/textlike loader shape) — a synchronous fflate throw (invalid
// zip) or a missing-part throw propagates as a normal throw the dispatch's `await LOADERS[format](bytes)` catches
// and wraps as `ExtractionFailedError('docx')`.
export function loadDocx(bytes: Uint8Array): Promise<RawExtraction> {
  const files = unzipSync(bytes, { filter: documentFilter });
  const part = files[DOCUMENT_PART];
  if (part === undefined) {
    throw new Error(`docx is missing ${DOCUMENT_PART}`);
  }
  const xml = strFromU8(part);
  const paragraphs: string[] = [];
  for (const match of xml.matchAll(PARAGRAPH)) {
    paragraphs.push(paragraphText(match[1] ?? ""));
  }
  return Promise.resolve({ text: paragraphs.join("\n\n") });
}
