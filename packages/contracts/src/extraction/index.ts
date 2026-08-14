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
