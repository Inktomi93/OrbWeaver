// #67 inline-attachment RENDER resolver — the context + consumer half (the Provider is
// `attachment-url-provider.tsx`, split out so a JSX module never mixes a hook export with a component export,
// the `useComponentExportOnlyModules` gate). A message body stores its images as `asset:<id>` TEXT (D51);
// the row resolves each id → its owner's `blobUrl(hash)` and shares the map over THIS context so
// `MessageContent`/`message-row-parts` stay PURE + provider-free (a CT story / the read-only edit preview
// mounts them with no provider → the default empty map → the graceful "unavailable" placeholder).

import { tokenizeContent } from "@orb/kit/content";
import type { AssetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createContext, use } from "react";

/** One resolved inline attachment: the `blobUrl` + the stored mime (#317 — the media block picks the
 *  element off it: `video/*` renders a native `<video>`, everything else the `<img>` path) + the stored
 *  intrinsic size (#625 — the media block reserves the true box with it before the bytes arrive). */
export interface ResolvedAttachment {
  readonly url: string;
  readonly mime: string;
  /** The asset's stored pixel dimensions, or `undefined` when it has none (a non-image, an unparseable
   *  header, a row written before #625) — the media block then falls back to its placeholder aspect. */
  readonly dims?: { readonly w: number; readonly h: number };
}

const EMPTY: ReadonlyMap<AssetId, ResolvedAttachment> = new Map<AssetId, ResolvedAttachment>();

/** The row-scoped `assetId → {blobUrl, mime}` map for inline attachments (default empty for a
 *  provider-less mount). */
export const AttachmentUrlContext = createContext<ReadonlyMap<AssetId, ResolvedAttachment>>(EMPTY);

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

/** The resolved `{blobUrl, mime}` for one inline attachment (#67/#317), or `undefined` while unresolved /
 *  provider-less (→ the row renders the placeholder). Consumed by `MessageMediaBlock`'s asset arm. */
export function useAttachmentUrl(assetId: AssetId): ResolvedAttachment | undefined {
  return use(AttachmentUrlContext).get(assetId);
}
