// verb: listOwnedBookIds — the owner's whole book set, id-only. The bundle descriptor's `exportAll` streams
// one book at a time over this enumeration (bounded memory); before F8 the composition root ran this query
// itself, which put a world-info read in a file whose stated job is "assembling descriptors from verbs".
// `id ASC` because the export STREAMS this enumeration: its order IS the bundle's order, and an unordered
// read makes two exports of an unchanged library differ. The PK is a total order by construction.

import { worldBooks } from "@orb/db";
import type { WorldBookId } from "@orb/kit/ids";
import { asc, eq } from "drizzle-orm";
import type { ListOwnedBookIds, WorldInfoExportContext } from "../contract/export.ts";

export function createListOwnedBookIds(ctx: WorldInfoExportContext): ListOwnedBookIds {
  return async ({ ownerId }): Promise<readonly WorldBookId[]> => {
    const rows = await ctx.db.select({ id: worldBooks.id }).from(worldBooks).where(eq(worldBooks.ownerId, ownerId)).orderBy(asc(worldBooks.id));
    return rows.map((r) => r.id);
  };
}
