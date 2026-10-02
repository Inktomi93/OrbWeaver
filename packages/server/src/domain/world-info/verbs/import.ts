// verb: import — the STANDALONE world-info-book import: parse an untrusted upload (orb-native envelope or a
// raw SillyTavern world file) through the ONE serde core, then the UNATTACHED additive owned write. Never
// throws for a malformed file: a parse miss returns `{ ok:false, error }`. `export.ts` is the round-trip twin.

import { fileStem } from "@orb/kit/strings";
import { portableParseError } from "#kit/serde/lib";
import { parseWorldBookFile, WORLD_INFO_SCHEMA_KIND } from "#kit/serde/world-info";
import type { ImportWorldBook, ImportWorldBookContext, ImportWorldBookOutcome } from "../contract/import.ts";

/** The name a SillyTavern world file lands under when the door learned no filename. */
const UNNAMED_BOOK = "Imported world book";

function bookNameFor(filename: string | undefined): string {
  const stem = filename === undefined ? "" : fileStem(filename);
  return stem.length > 0 ? stem : UNNAMED_BOOK;
}

export function createImport(ctx: ImportWorldBookContext): ImportWorldBook {
  return async ({ ownerId, bytes, filename }): Promise<ImportWorldBookOutcome> => {
    const parsed = parseWorldBookFile(bytes, bookNameFor(filename));
    if (!parsed.ok) {
      return { ok: false, error: portableParseError(WORLD_INFO_SCHEMA_KIND, parsed.reason) };
    }
    const result = await ctx.importStandalone({ ownerId, book: parsed.value });
    return { ok: true, created: result.created, name: result.name, renamedFrom: result.renamedFrom };
  };
}
