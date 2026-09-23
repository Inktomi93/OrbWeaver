// infra/extraction/normalize.ts — the §2 normalization pipeline every loader's raw output passes through.
// Pure string→string: the UTF-8 decode already happened in the loader (the text
// family decodes STRICT — invalid bytes throw there and the dispatch wraps them as ExtractionFailedError).
// Here: strip a leading BOM, CRLF/lone-CR → `\n`, unicode NFC, collapse 3+ blank lines to one. NO trimming
// inside lines, NO case folding — the extracted text is canon.

/** A leading UTF-8 BOM (U+FEFF). */
const LEADING_BOM = /^\uFEFF/;
/** CRLF + a lone CR → `\n`. */
const CR_NEWLINES = /\r\n?/g;
/** 3+ consecutive blank lines = 4+ newlines. Collapse to a single blank line (`\n\n`) so the chunker's
 *  paragraph boundary stays meaningful without rewriting content. */
const BLANK_LINE_RUN = /\n{4,}/g;

export function normalizeText(raw: string): string {
  return raw.replace(LEADING_BOM, "").replace(CR_NEWLINES, "\n").normalize("NFC").replace(BLANK_LINE_RUN, "\n\n");
}
