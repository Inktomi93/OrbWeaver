// verb: exportAssets — streams every blob the owner's library references (FK refs via
// selectOwnedReferencedAssetIds + text-side asset:<id> refs from message bodies). Each id passes through the
// owner gate (loadOwnedAssetForExport) — a gone id or foreign-owned inline ref is silently skipped, never
// read from a foreign CAS partition. Lazy generator: bounded memory, no abort signal (isomorphic contract).

import type { PortableEntity, PortableFile } from "@orb/contracts/portability";
import type { UserId } from "@orb/kit/ids";
import type { AssetsPortabilityContext } from "../contract/portability";
import {
  loadOwnedAssetForExport,
  selectInlineReferencedContents,
  selectOwnedReferencedAssetIds,
} from "../persistence/portable-refs";
import {
  buildPortableAssetFilename,
  extractInlineAssetIds,
} from "../substrate/portable-asset-file";

export function createExportAssets(ctx: AssetsPortabilityContext): PortableEntity["exportAll"] {
  return async function* exportAll(ownerId: UserId): AsyncIterable<PortableFile> {
    const ids = await selectOwnedReferencedAssetIds(ctx.db, ownerId);
    for (const content of await selectInlineReferencedContents(ctx.db, ownerId)) {
      for (const id of extractInlineAssetIds(content)) {
        ids.add(id);
      }
    }

    for (const id of ids) {
      // biome-ignore lint/performance/noAwaitInLoops: export streams one blob at a time (bounded memory — the descriptor contract); the owner-gate read + CAS read are intentionally sequential per file.
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
