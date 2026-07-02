// domain/export/contract/results — the verb result shapes (§7.4 / types-in-contract — one home).
//
// `ExportedCard` is the `exportCharacter` envelope: the PNG bytes + the download filename the entry HTTP
// registrar streams (Content-Disposition). It is server-only (the client uses the `/api/export/...` href,
// not the bytes), so it stays a domain-internal contract type. A not-owned / missing character surfaces as
// `null` (→ 404) from the verb, NOT this shape — there is no error class (export.md §8-slot).
//
// `ExportedText` (PD-42) is the `exportChat` envelope: the JSONL/TXT string + the download filename. A
// non-host / missing chat surfaces as `null` (→ 404) from the verb (D29) — same no-error-class posture.

/** The downloadable card artifact: the V3 PNG bytes + a filename-safe download name (e.g. `aria.png`). */
export interface ExportedCard {
  readonly bytes: Uint8Array;
  readonly filename: string;
}

/** The downloadable transcript artifact: the JSONL/TXT text + a filename-safe download name. */
export interface ExportedText {
  readonly text: string;
  readonly filename: string;
}
