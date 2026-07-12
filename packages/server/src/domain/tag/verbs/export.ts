// verb: export — read the owner's whole tag namespace as portable tag-library JSON bytes (the standalone
// tag-library backup; the uniform export/import portability template, §1 part 2). Owner-scoped: reads ONLY
// `tags` rows where `ownerId = ownerId` (the ordered `listOwnedTags`), projects each to the id-less/owner-less
// `CanonicalTag`, and hands the set to `#kit/serde/tag`'s `buildTagLibrary`. PURE read + serde — no db write,
// no audit (a read leaves no trace). `import.ts` is the round-trip twin: `export` bytes → `import` re-creates
// the same tag namespace under the importing owner (fresh ids, deduped by name).

import type { UserId } from "@orb/kit/ids";
import type { CanonicalTag } from "#kit/serde/tag";
import { buildTagLibrary } from "#kit/serde/tag";
import type { TagContext } from "../contract/service";
import { listOwnedTags } from "../persistence/queries";

/** Read the owner's tags and serialize them to tag-library JSON bytes. */
export function createExport(ctx: TagContext): (ownerId: UserId) => Promise<Uint8Array> {
  return async (ownerId: UserId): Promise<Uint8Array> => {
    const rows = await listOwnedTags(ctx.db, ownerId);
    const tags: CanonicalTag[] = rows.map((row) => ({
      name: row.name,
      color: row.color,
      color2: row.color2,
      source: row.source,
      folderType: row.folderType,
      sortOrder: row.sortOrder,
      isHiddenOnCard: row.isHiddenOnCard,
    }));
    return buildTagLibrary({ tags });
  };
}
