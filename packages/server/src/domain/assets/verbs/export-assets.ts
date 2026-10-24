// verb: exportAssets — streams every blob the owner's library references: the GC live set narrowed to this
// owner (`selectOwnedReferencedAssetIds` — the FK registry, the JSON-pinned backgrounds and the owner's own
// inline `asset:<id>` body refs), so the bundle carries exactly what the sweep keeps. Each id passes through
// the owner gate (loadOwnedAssetForExport) — a gone id is silently skipped, never read from a foreign CAS
// partition. Lazy generator: bounded memory, no abort signal (isomorphic contract).

import type { PortableEntity, PortableFile } from "@orb/contracts/portability";
import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { UserId } from "@orb/kit/ids";
import type { AssetsPortabilityContext } from "../contract/portability.ts";
import { selectOwnedReferencedAssetIds } from "../persistence/asset-refs.ts";
import { loadOwnedAssetForExport } from "../persistence/portable-refs.ts";
import { buildPortableAssetFilename } from "../substrate/portable-asset-file.ts";

export function createExportAssets(input: DbAssemblyInput<AssetsPortabilityContext>): PortableEntity["exportAll"] {
  const ctx: AssetsPortabilityContext = { ...input, db: databaseForOwner(input.db) };
  return async function* exportAll(ownerId: UserId): AsyncIterable<PortableFile> {
    for (const id of await selectOwnedReferencedAssetIds(ctx.db, ownerId)) {
      const meta = await loadOwnedAssetForExport(ctx.db, ownerId, id);
      if (meta === undefined) {
        continue;
      }
      const bytes = await ctx.cas.read(ownerId, meta.hash);
      yield {
        filename: buildPortableAssetFilename({
          hash: meta.hash,
          id,
          kind: meta.kind,
          mime: meta.mime,
        }),
        bytes,
      };
    }
  };
}
