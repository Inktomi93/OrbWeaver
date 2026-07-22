// infra/extraction/loaders/textlike.ts — the loader-free formats (text/plain + text/markdown), 04 §2. Decode
// STRICT UTF-8 (fatal: invalid bytes throw a TypeError, which the dispatch wraps as ExtractionFailedError).
// Markdown syntax is KEPT verbatim — headings/lists are retrieval-useful structure the chunker splits on the
// blank lines markdown already carries; NO md→plaintext rendering. Normalization (BOM/CRLF/NFC/blank-line
// collapse) runs in the dispatch; this loader only decodes.

import type { RawExtraction } from "../loader";

const STRICT_UTF8 = new TextDecoder("utf-8", { fatal: true });

export function loadTextlike(bytes: Uint8Array): Promise<RawExtraction> {
  return Promise.resolve({ text: STRICT_UTF8.decode(bytes) });
}
