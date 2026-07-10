// The tag-management CRUD mutations (Settings → Tags), one `createEntityMutation` per verb — the same
// module-scope factory pattern as use-character-mutations.ts. Every tag verb emits `tagsChanged` on the
// user-bus, and `USER_BUS_FILTERS.tagsChanged` path-invalidates the WHOLE `tag` router (so
// `tag.listTagsWithUsage`, this pane's read, refetches); that subscription is ALWAYS on (home-page.tsx), so
// these are `busDriven` — the echo reconciles the acting device AND another device (a self-`invalidates`
// would double-refetch). Rename shares `updateTag` with the color/folder/hide edits but carries its OWN
// instance purely for an accurate error toast (the `(ownerId, name)` unique → a DomainConflictError the
// server maps to tRPC CONFLICT). TVars are the tRPC-INFERRED inputs; this feature talks to `trpc.tag.*`
// directly (the cross-feature-reads-ride-trpc seam — there is no client tag FEATURE to sideways-import).

import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

/** Rename a tag (name-only patch). Its own instance for a name-conflict-aware toast. `busDriven` —
 *  `tagsChanged` covers `tag.listTagsWithUsage`. */
export const useRenameTag = createEntityMutation<inferInput<Trpc["tag"]["updateTag"]>, unknown>({
  options: (trpc) => trpc.tag.updateTag.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't rename the tag — that name may already be in use.",
});

/** Update a tag's style/behavior (color · color2 · folderType · isHiddenOnCard). `busDriven`. */
export const useUpdateTagStyle = createEntityMutation<
  inferInput<Trpc["tag"]["updateTag"]>,
  unknown
>({
  options: (trpc) => trpc.tag.updateTag.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't update the tag.",
});

/** Delete a tag (cascades its junction rows server-side). `busDriven`. */
export const useRemoveTag = createEntityMutation<inferInput<Trpc["tag"]["removeTag"]>, unknown>({
  options: (trpc) => trpc.tag.removeTag.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't delete the tag.",
});

/** Merge one tag into another (re-points every attachment, then deletes the source). `busDriven`. */
export const useMergeTags = createEntityMutation<inferInput<Trpc["tag"]["mergeTags"]>, unknown>({
  options: (trpc) => trpc.tag.mergeTags.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't merge the tags.",
});

/** Persist the manual tag order (position → sortOrder). `busDriven`. */
export const useSetTagOrder = createEntityMutation<inferInput<Trpc["tag"]["setTagOrder"]>, unknown>(
  {
    options: (trpc) => trpc.tag.setTagOrder.mutationOptions(),
    busDriven: true,
    errorToast: "Couldn't reorder the tags.",
  },
);

/** Delete every tag with zero attachments (the "Prune unused" action). `busDriven`. */
export const usePruneUnusedTags = createEntityMutation<void, unknown>({
  options: (trpc) => trpc.tag.pruneUnusedTags.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't prune the unused tags.",
});
