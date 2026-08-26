// verb: importOrphanCharacter — mint a MINIMAL placeholder character for an ORPHAN chats/ directory
// (transcripts whose card PNG is absent from the profile), so its chats can import instead of being
// skipped. 7 real dirs on the 2026-08-15 corpus run (Aestel/Ana/Bonnie_Cow/Diana/Mako/Misery/Sala).
//
// THE EVIDENCE RULE — the mint carries ONLY what the directory proves, NEVER invented prose:
//   • name: the most frequent NON-SENTINEL transcript header `character_name` (ST writes the literal
//     sentinel `"unused"` on 583 of the 1,097 corpus headers — measured 6 of the 7 orphan dirs' 8 files;
//     one Diana file carries the real name), else the directory's own name, underscores humanized
//     ("Bonnie_Cow" → "Bonnie Cow").
//   • description: EMPTY. A husk is a husk — the owner fleshes it out (the driver tags every mint
//     "orphan import", manual/accepted, so the library filter finds them all).
//
// IDEMPOTENCY: a SYNTHETIC importHash — sha256 of a namespaced dir key (below) — through the same
// (ownerId, importHash) oracle a card's byte hash uses. Chosen over a handle match because it survives the
// owner RENAMING the minted character's handle, and the namespace prefix can never collide with a real
// card-file hash (those are hex of the PNG bytes; this hashes a prefixed key). Re-runs resolve the same
// row and write nothing; the chats then dedup by their own byte hashes.

import type { CharacterHandle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { sha256Hex } from "#kit/content-hash";
import type { ImportContext } from "../context.ts";
import type { ImportOrphanCharacterInput } from "../contract/params.ts";
import type { ImportOrphanCharacterResult } from "../contract/results.ts";
import type { ImportService } from "../contract/service.ts";

/** ST's header sentinel for "no persona was resolved" — never a character name (§5.7's corpus census). */
const ST_UNUSED_SENTINEL = "unused";

/** The synthetic-importHash namespace. Hashing a PREFIXED KEY (not file bytes) keeps the oracle's rows
 *  disjoint from real card hashes by construction. */
const ORPHAN_HASH_PREFIX = "orb-orphan-chat-dir:";

/** The mint's display name — see the header's evidence rule. A header equal to the DIR NAME is excluded
 *  too: the serde substitutes `charDirName` for a sentinel/empty header (`serde/chat` — the "unused"
 *  fallback), so that spelling is an ECHO of the directory, not independent evidence. */
function orphanName(dirName: string, headerNames: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const raw of headerNames) {
    const name = raw.trim();
    if (name.length === 0 || name.toLowerCase() === ST_UNUSED_SENTINEL || name === dirName) {
      continue;
    }
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [name, count] of counts) {
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  }
  return best ?? dirName.replaceAll("_", " ").trim();
}

export function createImportOrphanCharacter(ctx: ImportContext): ImportService["importOrphanCharacter"] {
  return async ({ dirName, handle, headerNames }: ImportOrphanCharacterInput): Promise<ImportOrphanCharacterResult> => {
    const importHash = sha256Hex(`${ORPHAN_HASH_PREFIX}${handle}`);
    const name = orphanName(dirName, headerNames);

    const existing = await ctx.findByImportHash({ ownerId: ctx.ownerId, importHash });
    if (existing !== null) {
      return { characterId: existing, created: false, name };
    }

    // The same free-handle probe `importCharacter` runs (its `freeHandle`): per-owner unique, numeric
    // suffix on collision. A collision here means the OWNER already has a character at this slug — the
    // orphan still mints its own row (we never adopt a same-named character; the pairing pass upstream
    // already decided no card matches this dir).
    let free: CharacterHandle = handle;
    let n = 2;
    while ((await ctx.findByHandle({ ownerId: ctx.ownerId, handle: free })) !== null) {
      free = castId<CharacterHandle>(`${handle}-${n}`);
      n += 1;
    }

    const ref = await ctx.createCharacter({
      ownerId: ctx.ownerId,
      input: { handle: free, name, description: "" },
      importedFrom: `chats/${dirName}`,
      importHash,
    });
    return { characterId: ref.characterId, created: true, name };
  };
}
