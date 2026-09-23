// infra/extraction/formats.ts — the format dispatch: MIME → DocFormat, and the exhaustive DocFormat → Loader
// Record. The Record is a `{ [F in DocFormat]: Loader }` mapped type (the §7.5 gold
// standard) — a new DOC_FORMATS member without a loader is a tsc error, so registration can never half-land.

import type { DocFormat } from "@orb/contracts/extraction";
import type { Loader } from "./loader.ts";
import { loadDocx } from "./loaders/docx.ts";
import { loadEpub } from "./loaders/epub.ts";
import { loadHtml } from "./loaders/html.ts";
import { loadPdf } from "./loaders/pdf.ts";
import { loadTextlike } from "./loaders/textlike.ts";

// The canonical mimes for the zip-container document formats (docx = OOXML, epub = OPF) — the enforceMagic belt
// (`domain/assets/substrate/mime.ts`) admits their `PK\x03\x04` signature; both loaders unzip with fflate.
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const EPUB_MIME = "application/epub+zip";

/** The exhaustive format → loader dispatch. Adding a `DocFormat` member without a loader fails `tsc`. */
export const LOADERS: { readonly [F in DocFormat]: Loader } = {
  pdf: loadPdf,
  html: loadHtml,
  markdown: loadTextlike,
  text: loadTextlike,
  docx: loadDocx,
  epub: loadEpub,
};

/** Exact mime → format, keyed after the caller strips parameters + lowercases (`text/html; charset=utf-8` →
 *  `text/html`). `text/x-markdown` is the legacy markdown alias. A miss throws `UnsupportedDocTypeError`. */
export const MIME_TO_FORMAT: Readonly<Record<string, DocFormat>> = {
  "application/pdf": "pdf",
  "text/html": "html",
  "text/markdown": "markdown",
  "text/x-markdown": "markdown",
  "text/plain": "text",
  [DOCX_MIME]: "docx",
  [EPUB_MIME]: "epub",
};
