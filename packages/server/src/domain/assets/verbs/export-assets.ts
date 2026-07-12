// verb: exportAssets — the assets-portability EXPORT half (the `PortableEntity.exportAll` for the `assets`
// kind; the entry root composes the descriptor). Streams EVERY blob the owner's library references, so a
// bundle is self-contained (audit gap G-1: only the card PNG travelled before). The id union is:
//   (a) the FK side — `selectOwnedReferencedAssetIds` walks the asset-ref REGISTRY (avatars, gallery, sprites,
//       document sources, NPC art, imagery generations), and
//   (b) the TEXT side — the chat-canon `asset:<id>` refs extracted from the owner's message bodies (the refs
//       no FK column holds; the `asset-refs` KNOWN LIMITATION).
// Each id is resolved through the OWNER GATE (`loadOwnedAssetForExport`): a gone id, or an inline ref to
// another user's asset, is silently skipped — never read from a foreign CAS partition, never exported. Each
// surviving blob is read from the owner's CAS and emitted under its self-describing name
// (`substrate/portable-asset-file`), which carries the ORIGINAL id so the target box re-links with no remap.
//
// Lazy generator: the delivery core zips each file as it is pulled, so a large library stays within bounded
// memory (the descriptor contract). Abort is the core's job (it stops pulling) — no signal here (isomorphic
// contract).

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
        continue; // owner gate: a gone id, or an inline ref to a foreign asset — skip, never export.
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
