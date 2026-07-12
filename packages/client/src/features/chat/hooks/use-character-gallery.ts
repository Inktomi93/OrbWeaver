// The per-character gallery curation mutations (G4, gallery-design §1.3) — used by the gallery modal reached
// from the chat ⋯ menu's "[Character]'s Gallery" entry. Each carries its own `invalidates` refetching
// `assets.listGallery` — gallery curation is NOT on the SSE chat bus (assets are per-user state, not chat
// canon), so it reconciles itself (the preset-mutations precedent). The list READS are inlined at the two
// component call sites (`useQuery(trpc.assets.list*.queryOptions(...))`) — a wrapper hook would need to
// spell the tRPC error type for `useExplicitReturnType`, which the inline read sidesteps. tRPC input/output
// types are inferred, never re-declared (`no-client-wire-redeclare`).

import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

/** The keyset page size for both gallery reads (§1.3 wire clamp is 1..100). A single page of 100 covers a
 *  character's gallery for v1; the grid virtualizes, and paging past 100 is a follow-up. */
export const GALLERY_PAGE_LIMIT = 100;

/** Curate an owned asset into a character's gallery (idempotent server-side). Refetches the gallery. */
export const useAddToGallery = createEntityMutation<
  inferInput<Trpc["assets"]["addToGallery"]>,
  inferOutput<Trpc["assets"]["addToGallery"]>
>({
  options: (trpc) => trpc.assets.addToGallery.mutationOptions(),
  invalidates: (trpc) => [trpc.assets.listGallery.pathFilter()],
  errorToast: "Couldn't add that image to the gallery.",
});

/** Remove a curated item from the gallery (the underlying asset is untouched). Refetches the gallery. */
export const useRemoveFromGallery = createEntityMutation<
  inferInput<Trpc["assets"]["removeFromGallery"]>,
  unknown
>({
  options: (trpc) => trpc.assets.removeFromGallery.mutationOptions(),
  invalidates: (trpc) => [trpc.assets.listGallery.pathFilter()],
  errorToast: "Couldn't remove that image from the gallery.",
});

/** Import a searched gif (Tenor) into a character's gallery (D61). The server re-validates the URL host +
 *  the bytes; on success a new `gallery_items` row appears, so this refetches the gallery. */
export const useImportGif = createEntityMutation<
  inferInput<Trpc["hub"]["importGif"]>,
  inferOutput<Trpc["hub"]["importGif"]>
>({
  options: (trpc) => trpc.hub.importGif.mutationOptions(),
  invalidates: (trpc) => [trpc.assets.listGallery.pathFilter()],
  errorToast: "Couldn't import that gif.",
});
