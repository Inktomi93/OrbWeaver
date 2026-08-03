// verb: import — restore a tag-library file into the owner's OWN tag namespace, the twin of export.ts.
// Idempotent: dedupes by (ownerId, lower(name)); a same-name tag is MERGED IN PLACE (O-3 restore-wins — it
// keeps its id, so every junction survives, and takes the backup's presentation axes), intra-file duplicates
// collapse to first. A malformed file throws DomainOperationError; the portability core wraps it per-file so
// one bad file never aborts a bundle.

import type { tags } from "@orb/db";
import { DomainOperationError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";
import { normalizeTagName } from "@orb/kit/tag";
import { portableParseError } from "#kit/serde/lib";
import { parseTagLibrary, TAG_LIBRARY_SCHEMA_KIND } from "#kit/serde/tag";
import type { TagLibraryImportResult } from "../contract/results";
import type { TagContext } from "../contract/service";
import { restoreOwnedTags } from "../persistence/queries";

/** Parse tag-library bytes and merge them into the owner's namespace (idempotent, dedup by folded name). */
export function createImport(ctx: TagContext): (ownerId: UserId, bytes: Uint8Array) => Promise<TagLibraryImportResult> {
  return async (ownerId: UserId, bytes: Uint8Array): Promise<TagLibraryImportResult> => {
    const parsed = parseTagLibrary(bytes);
    if (!parsed.ok) {
      throw new DomainOperationError("tag_library_unparseable", portableParseError(TAG_LIBRARY_SCHEMA_KIND, parsed.reason));
    }
    const library = parsed.value;

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

    const created = await restoreOwnedTags(ctx.db, ownerId, values);

    if (values.length > 0) {
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
