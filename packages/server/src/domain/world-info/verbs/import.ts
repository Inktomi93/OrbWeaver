// verb: import (W-worldinfo; export-import-portability.md §1) — the STANDALONE world-info-book import: parse
// an untrusted `worlds/*.json` upload via the ONE standalone serde core (`#kit/serde/world-info`
// `parseWorldBookFile`) → the canonical `BulkImportLorebookInput` → the UNATTACHED owned write
// (`createImportStandaloneLorebook`, injected on the context). The book lands with NO attachment (the user
// attaches it via the existing attach verbs) and DEDUPES on `(ownerId, name)` reuse-or-replace (R6).
//
// NEVER throws for a malformed file — a parse miss returns `{ ok:false, error }` so one bad file can't abort
// a bundle import (the delivery-core per-file isolation posture, the card `failures[]` precedent).
// `export.ts` is the round-trip twin.

import { portableParseError } from "#kit/serde/lib";
import { parseWorldBookFile, WORLD_INFO_SCHEMA_KIND } from "#kit/serde/world-info";
import type { ImportWorldBook, ImportWorldBookContext, ImportWorldBookOutcome } from "../contract/import";

export function createImport(ctx: ImportWorldBookContext): ImportWorldBook {
  return async ({ ownerId, bytes }): Promise<ImportWorldBookOutcome> => {
    const parsed = parseWorldBookFile(bytes);
    if (!parsed.ok) {
      return { ok: false, error: portableParseError(WORLD_INFO_SCHEMA_KIND, parsed.reason) };
    }
    const result = await ctx.importStandalone({ ownerId, book: parsed.value });
    return { ok: true, created: !result.replaced };
  };
}
