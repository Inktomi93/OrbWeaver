// The tag-management CRUD mutations, one createEntityMutation per verb. Every tag verb emits
// tagsChanged on the user-bus (always-on subscription), so these are busDriven.

import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

/** Rename a tag (name-only patch). Its own instance for a name-conflict-aware toast. */
export const useRenameTag = createEntityMutation<inferInput<Trpc["tag"]["updateTag"]>, unknown>({
  options: (trpc) => trpc.tag.updateTag.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't rename the tag — that name may already be in use.",
});

/** Update a tag's style/behavior (color · color2 · folderType · isHiddenOnCard). */
export const useUpdateTagStyle = createEntityMutation<
  inferInput<Trpc["tag"]["updateTag"]>,
  unknown
>({
  options: (trpc) => trpc.tag.updateTag.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't update the tag.",
});

/** Delete a tag (cascades its junction rows server-side). */
export const useRemoveTag = createEntityMutation<inferInput<Trpc["tag"]["removeTag"]>, unknown>({
  options: (trpc) => trpc.tag.removeTag.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't delete the tag.",
});

/** Merge one tag into another (re-points every attachment, then deletes the source). */
export const useMergeTags = createEntityMutation<inferInput<Trpc["tag"]["mergeTags"]>, unknown>({
  options: (trpc) => trpc.tag.mergeTags.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't merge the tags.",
});

/** Persist the manual tag order (position → sortOrder). */
export const useSetTagOrder = createEntityMutation<inferInput<Trpc["tag"]["setTagOrder"]>, unknown>(
  {
    options: (trpc) => trpc.tag.setTagOrder.mutationOptions(),
    busDriven: true,
    errorToast: "Couldn't reorder the tags.",
  },
);

/** Delete every tag with zero attachments (the "Prune unused" action). */
export const usePruneUnusedTags = createEntityMutation<void, unknown>({
  options: (trpc) => trpc.tag.pruneUnusedTags.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't prune the unused tags.",
});
