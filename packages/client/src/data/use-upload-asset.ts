// `useUploadAsset` — the upload seam BOUND TO ITS FRESHNESS CONSEQUENCE, and the front door every feature
// upload goes through (the bare `uploadAsset` below it stays exported for its own unit test + as the
// non-React transport; a feature that calls it directly silently re-opens the bug this hook closes).
//
// The bug: the upload route is a RAW multipart POST, not a tRPC mutation, so it has no `invalidates` and
// invalidated nothing. `assets.listOwned` — the owned-asset picker in the character gallery dialog
// (features/chat/anchors/character-gallery-dialog.tsx) — therefore missed anything uploaded elsewhere in
// the session (a persona/character avatar, a background, a chat attachment) until gcTime evicted it: the
// app QueryClient runs `staleTime: Infinity` with no focus-refetch, so a completed upload was invisible to
// the one surface that lists uploads.
//
// The invalidate is the ROUTER-PATH filter for `listOwned` and runs on SUCCESS only — a throw propagates
// untouched (every caller owns its own failure UI), and nothing was minted, so nothing is stale.

import type { AssetKind, StoredAsset } from "@orb/contracts/assets";
import { useTRPC } from "./trpc";
import { uploadAsset } from "./upload-asset";
import { useInvalidation } from "./use-invalidation";

/** Upload a picked `File` as a content-addressed asset, then stale the owned-asset list it just grew.
 *  Same signature + same throw behavior as {@link uploadAsset}; the freshness is the whole difference. */
export function useUploadAsset(): (file: File, kind: AssetKind) => Promise<StoredAsset> {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  return async (file, kind): Promise<StoredAsset> => {
    const stored = await uploadAsset(file, kind);
    invalidation.invalidateFilters([trpc.assets.listOwned.pathFilter()]);
    return stored;
  };
}
