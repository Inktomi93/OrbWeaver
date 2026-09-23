// The per-character gallery curation mutations — used by the gallery modal reached
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
export const useAddToGallery = createEntityMutation<inferInput<Trpc["assets"]["addToGallery"]>, inferOutput<Trpc["assets"]["addToGallery"]>>({
  options: (trpc) => trpc.assets.addToGallery.mutationOptions(),
  invalidates: (trpc) => [trpc.assets.listGallery.pathFilter()],
  errorToast: "Couldn't add that image to the gallery.",
});

/**
 * Remove a curated item from the gallery (the underlying asset is untouched). Refetches the gallery.
 *
 * NO `errorToast`, deliberately (#1563a). Its ONE caller is the gallery lightbox's destructive confirm, and
 * #1563 gave `ConfirmDialog` an inline failure line that holds the dialog open with its own button as the
 * retry — so a toast on top made one refused press say the same thing twice, once in the dialog the reader
 * is looking at and once in a global notice over it. The sibling `useAddToGallery` KEEPS its toast: its
 * caller is a fire-and-forget batch add with no per-press surface of its own.
 *
 * ENDS WHEN a second call site appears that does not own a failure surface — then this owes the function
 * form, not a bare string, so the confirm's press stays silent while the new caller toasts.
 */
export const useRemoveFromGallery = createEntityMutation<inferInput<Trpc["assets"]["removeFromGallery"]>, unknown>({
  options: (trpc) => trpc.assets.removeFromGallery.mutationOptions(),
  invalidates: (trpc) => [trpc.assets.listGallery.pathFilter()],
});
