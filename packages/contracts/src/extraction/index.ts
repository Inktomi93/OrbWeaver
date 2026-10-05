// `@orb/contracts/extraction` — the cross-boundary contract for text extraction. The
// op TYPE + result + error pair live HERE (not in `infra/extraction`, not in `domain/databank`): infra
// IMPLEMENTS the op, the domain INJECTS it — the exact `EmbedRequest`/`@orb/contracts/providers` precedent. A
// domain must never import `infra/*` for a type, and the client needs the error IDENTITIES to render
// "unsupported type" vs "extraction failed" distinctly.
//
// The error taxonomy is load-bearing: `UnsupportedDocTypeError` = the caller sent a type the system
// does not do (thrown BEFORE any parse; a 415-class, never retried, never wrapped); `ExtractionFailedError` =
// a supported format's loader threw (corrupt/encrypted/invalid file) — retryable only in the sense that a
// FUTURE `EXTRACTOR_VERSION` may succeed. Empty text is NOT an error (a scanned image-only PDF extracts to
// near-empty; `charCount` tells the story, the upload verb surfaces a warning, not a throw).

/** The document formats extraction can dispatch to. The MIME→format map + the format→loader Record derive
 *  from this ONE tuple; a new member without a loader is a tsc error in `infra/extraction`. */
export const DOC_FORMATS = ["pdf", "html", "markdown", "text", "docx", "epub"] as const;

export type DocFormat = (typeof DOC_FORMATS)[number];

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const EPUB_MIME = "application/epub+zip";

/** The ONE accepted-type list: every mime extraction dispatches, keyed without parameters and lowercased.
 *  `text/x-markdown` is the legacy markdown alias. The server's loader dispatch and the client's type labels
 *  both read it. */
export const MIME_TO_FORMAT: Readonly<Record<string, DocFormat>> = {
  "application/pdf": "pdf",
  "text/html": "html",
  "text/markdown": "markdown",
  "text/x-markdown": "markdown",
  "text/plain": "text",
  [DOCX_MIME]: "docx",
  [EPUB_MIME]: "epub",
};

/** The filename suffixes each format arrives with (a browser often reports no mime for `.md` or `.epub`). Total
 *  over {@link DocFormat}, so a new format fails `tsc` until it names its suffixes. */
export const DOC_FORMAT_EXTENSIONS: { readonly [F in DocFormat]: readonly string[] } = {
  pdf: [".pdf"],
  html: [".html", ".htm"],
  markdown: [".md", ".markdown"],
  text: [".txt"],
  docx: [".docx"],
  epub: [".epub"],
};

/** Storable upload formats; HTML extraction stays scrape-only because the CAS refuses active document MIME. */
export const DOC_UPLOAD_FORMATS = DOC_FORMATS.filter((format) => format !== "html");
const DOC_UPLOAD_MIMES = Object.keys(MIME_TO_FORMAT).filter((mime) => MIME_TO_FORMAT[mime] !== "html");
const GENERIC_BINARY_MIME = "application/octet-stream";

/** The file picker vocabulary for formats the CAS can safely store, not every extraction loader. */
export const DOC_UPLOAD_ACCEPT: string = [...DOC_UPLOAD_FORMATS.flatMap((format) => DOC_FORMAT_EXTENSIONS[format]), ...DOC_UPLOAD_MIMES].join(",");

/** Resolve a document upload's declared MIME, inferring only an absent/generic browser claim by suffix.
 * The CAS still verifies the bytes; an explicit unsupported or active claim is never replaced. */
export function docUploadMime(mime: string, filename: string): string | undefined {
  const declared = mime.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (declared.length > 0 && declared !== GENERIC_BINARY_MIME) {
    return DOC_UPLOAD_MIMES.includes(declared) ? declared : undefined;
  }
  const name = filename.toLowerCase();
  const format = DOC_UPLOAD_FORMATS.find((candidate) => DOC_FORMAT_EXTENSIONS[candidate].some((suffix) => name.endsWith(suffix)));
  return format === undefined ? undefined : DOC_UPLOAD_MIMES.find((candidate) => MIME_TO_FORMAT[candidate] === format);
}

/** The format a declared mime dispatches to, ignoring parameters and case (`text/html; charset=utf-8` →
 *  `html`); `undefined` for a mime extraction does not do. */
export function docFormatForMime(mime: string): DocFormat | undefined {
  return MIME_TO_FORMAT[mime.split(";", 1)[0]?.trim().toLowerCase() ?? ""];
}

export interface ExtractionMeta {
  readonly format: DocFormat;
  /** EXTRACTOR_VERSION at run time — stamped onto `documents.extractorVersion` (the re-extract predicate). */
  readonly extractorVersion: string;
  /** `text.length` (convenience; saves a re-measure at every consumer). */
  readonly charCount: number;
  /** pdf only. */
  readonly pageCount?: number;
  /** html `<title>` / epub package metadata / pdf info-dict title, when present. */
  readonly title?: string;
}

export interface ExtractionResult {
  /** UTF-8 clean, newlines normalized to `\n`, NFC-normalized. */
  readonly text: string;
  readonly meta: ExtractionMeta;
}

/** The injected op. `bytes` = the original source bytes (from the CAS or the in-flight upload); `mime` = the
 *  DECLARED mime (the sniff belt already ran at `assets.store`). */
export type ExtractTextOp = (bytes: Uint8Array, mime: string) => Promise<ExtractionResult>;

/** mime maps to no loader. Thrown BEFORE any parse. User-fixable; transport maps it to a 415-class error;
 *  NEVER retried; NEVER wrapped in {@link ExtractionFailedError}. */
export class UnsupportedDocTypeError extends Error {
  readonly mime: string;
  constructor(mime: string) {
    super(`unsupported document type: ${mime}`);
    this.name = "UnsupportedDocTypeError";
    this.mime = mime;
  }
}

/** A supported format's loader threw (corrupt/encrypted/invalid file, or a loader bug). Carries the format +
 *  the underlying cause. An immediate retry is pointless; a future extractor version may succeed. */
export class ExtractionFailedError extends Error {
  readonly format: DocFormat;
  constructor(format: DocFormat, options?: { cause?: unknown }) {
    super(`extraction failed for format: ${format}`, options);
    this.name = "ExtractionFailedError";
    this.format = format;
  }
}
