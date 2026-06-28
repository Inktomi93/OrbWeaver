// domain/export/contract/results — the verb result shapes (§7.4 / types-in-contract — one home).
//
// `ExportedCard` is the `exportCharacter` envelope: the PNG bytes + the download filename the entry HTTP
// registrar streams (Content-Disposition). It is server-only (the client uses the `/api/export/...` href,
// not the bytes), so it stays a domain-internal contract type. A not-owned / missing character surfaces as
// `null` (→ 404) from the verb, NOT this shape — there is no error class (export.md §8-slot).
//
// FLAG[PD-42]: `ExportedText { text; filename }` (the `exportChat` JSONL/TXT envelope) lands with the
// chat transcript verb in P5 — see contract/service.ts.

/** The downloadable card artifact: the V3 PNG bytes + a filename-safe download name (e.g. `aria.png`). */
export interface ExportedCard {
  readonly bytes: Uint8Array;
  readonly filename: string;
}
