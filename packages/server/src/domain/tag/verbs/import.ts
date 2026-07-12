// verb: import — restore a tag-library file into the owner's OWN tag namespace (the standalone tag-library
// backup twin of `export.ts`; the uniform export/import portability template, §1 part 3). Writes the tag
// domain's OWN `tags` table (a domain writing its own tables — no cross-domain Option-B op needed).
//
// IDEMPOTENT / MERGE: each tag dedupes by `(ownerId, name)` (case-insensitive, the `(ownerId, lower(name))`
// functional unique) — an existing name is left untouched, a new name is minted. Re-importing the same file
// creates ZERO rows. The name is `normalizeTagName`d before insert (the one chokepoint every tag source
// shares), so an import dedupes identically to a manual create; a blank/whitespace-only name is dropped, and
// intra-file duplicates (two rows folding to one name) collapse to the first.
//
// A file that is not a tag-library (`parseTagLibrary` → null) throws a `DomainOperationError` (the malformed-
// file case); the portability delivery core wraps this in its per-file `{ok:false, error}` isolation so one
// bad file never aborts a bundle.

import type { tags } from "@orb/db";
import { DomainOperationError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";
import { normalizeTagName } from "@orb/kit/tag";
import { parseTagLibrary } from "#kit/serde/tag";
import type { TagLibraryImportResult } from "../contract/results";
import type { TagContext } from "../contract/service";
import { insertOwnedTagsIfAbsent } from "../persistence/queries";

/** Parse tag-library bytes and merge them into the owner's namespace (idempotent, dedup by folded name). */
export function createImport(
  ctx: TagContext,
): (ownerId: UserId, bytes: Uint8Array) => Promise<TagLibraryImportResult> {
  return async (ownerId: UserId, bytes: Uint8Array): Promise<TagLibraryImportResult> => {
    const library = parseTagLibrary(bytes);
    if (library === null) {
      throw new DomainOperationError(
        "tag_library_unparseable",
        "the file is not a valid orb tag-library export",
      );
    }

    // Normalize + drop empties + collapse intra-file folded-name duplicates BEFORE the insert, so the minted
    // ids and the `(ownerId, lower(name))` conflict target line up exactly with the manual-create path.
    const seen = new Set<string>();
    const values: (typeof tags.$inferInsert)[] = [];
    for (const t of library.tags) {
      const name = normalizeTagName(t.name);
      if (name.length === 0) {
        continue;
      }
      const folded = name.toLowerCase();
      if (seen.has(folded)) {
        continue;
      }
      seen.add(folded);
      values.push({
        id: ctx.newTagId(),
        ownerId,
        name,
        color: t.color,
        color2: t.color2,
        source: t.source,
        folderType: t.folderType,
        sortOrder: t.sortOrder,
        isHiddenOnCard: t.isHiddenOnCard,
      });
    }

    const created = await insertOwnedTagsIfAbsent(ctx.db, values);

    if (created > 0) {
      await ctx.audit({
        actorUserId: ownerId,
        action: "tag.importLibrary",
        entityType: "tag",
        metadata: { total: library.tags.length, created },
      });
      ctx.emitUserEvent(ownerId, { type: "tagsChanged" });
    }

    return { total: library.tags.length, created };
  };
}
