// infra/extraction/formats.ts — the exhaustive DocFormat → Loader Record. The Record is a
// `{ [F in DocFormat]: Loader }` mapped type (the §7.5 gold standard) — a new DOC_FORMATS member without a
// loader is a tsc error, so registration can never half-land. The mime → format table lives in
// `@orb/contracts/extraction` (the client labels types from the same list).

import type { DocFormat } from "@orb/contracts/extraction";
import type { Loader } from "./loader.ts";
import { loadDocx } from "./loaders/docx.ts";
import { loadEpub } from "./loaders/epub.ts";
import { loadHtml } from "./loaders/html.ts";
import { loadPdf } from "./loaders/pdf.ts";
import { loadTextlike } from "./loaders/textlike.ts";

/** The exhaustive format → loader dispatch. Adding a `DocFormat` member without a loader fails `tsc`. */
export const LOADERS: { readonly [F in DocFormat]: Loader } = {
  pdf: loadPdf,
  html: loadHtml,
  markdown: loadTextlike,
  text: loadTextlike,
  docx: loadDocx,
  epub: loadEpub,
};
