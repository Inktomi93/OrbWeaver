// #67 inline-attachment RENDER resolver — the context + consumer half (the Provider is
// `attachment-url-provider.tsx`, split out so a JSX module never mixes a hook export with a component export,
// the `useComponentExportOnlyModules` gate). A message body stores its images as `asset:<id>` TEXT (D51);
// the row resolves each id → its owner's `blobUrl(hash)` and shares the map over THIS context so
// `MessageContent`/`message-row-parts` stay PURE + provider-free (a CT story / the read-only edit preview
// mounts them with no provider → the default empty map → the graceful "unavailable" placeholder).

import { tokenizeContent } from "@orb/kit/content";
import type { AssetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createContext, useContext } from "react";

const EMPTY: ReadonlyMap<AssetId, string> = new Map<AssetId, string>();

/** The row-scoped `assetId → blobUrl` map for inline attachments (default empty for a provider-less mount). */
export const AttachmentUrlContext = createContext<ReadonlyMap<AssetId, string>>(EMPTY);

/** The distinct `asset:<id>` refs in a body (the ONE ref grammar — `tokenizeContent`, never a regex). */
export function assetIdsInContent(content: string): AssetId[] {
  const ids = new Set<string>();
  // `committed` must MATCH the renderer's own tokenize (`toContentBlocks`): if this collector saw an image
  // the block projection has swallowed into an EOF-closed card, the row would ask for a URL nobody renders.
  for (const span of tokenizeContent(content, { committed: true })) {
    if (span.kind === "image" && span.ref.kind === "asset") {
      ids.add(span.ref.assetId);
    }
  }
  return [...ids].map((id) => castId<AssetId>(id));
}

/** The resolved `blobUrl` for one inline attachment (#67), or `undefined` while unresolved / provider-less
 *  (→ the row renders the placeholder). Consumed by `MessageMediaBlock`'s asset arm. */
export function useAttachmentUrl(assetId: AssetId): string | undefined {
  return useContext(AttachmentUrlContext).get(assetId);
}
