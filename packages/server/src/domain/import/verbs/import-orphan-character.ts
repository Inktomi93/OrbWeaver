// importOrphanCharacter preserves transcripts whose card PNG is absent by minting only directory-proven
// facts. Name is the most frequent non-sentinel header character_name, falling back to the humanized
// directory name. Description stays empty; the owner supplies prose. The driver marks orphan import for
// library discovery.
//
// The namespaced directory key has a synthetic importHash, resolved through the same ownerId/importHash
// oracle as card imports. It cannot collide with a card-file hash and survives handle renames. Reruns
// resolve the same row without writing; chats independently dedup by byte hash.

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
