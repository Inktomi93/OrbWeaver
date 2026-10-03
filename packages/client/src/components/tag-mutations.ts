// The tag-management CRUD mutations, one createEntityMutation per verb. Every tag verb emits
// tagsChanged on the user-bus (always-on subscription), so these are busDriven.

import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation, trpcErrorCode } from "#data";

/** The toast for a create the name index refused. */
export const CREATE_TAG_CONFLICT_TOAST = "Couldn't create the label — that name may already be in use.";

/** The server's case-folded name index refused the create (`DomainConflictError` → CONFLICT). Keyed on the
 *  structured code, never message text. */
export function isTagNameConflict(error: unknown): boolean {
  return trpcErrorCode(error) === "CONFLICT";
}

/** Create a tag from a name. The created ROW is typed (not `unknown`) because the collection's create verb
 *  selects it in CONTENT on the next frame. A name conflict is NOT toasted here: the create verb retries it
 *  once with the next free name and toasts only when that fails too. */
export const useCreateTag = createEntityMutation<inferInput<Trpc["tag"]["createTag"]>, inferOutput<Trpc["tag"]["createTag"]>>({
  options: (trpc) => trpc.tag.createTag.mutationOptions(),
  busDriven: true,
  errorToast: (error) => (isTagNameConflict(error) ? null : "Couldn't create the label."),
});

/** Rename a tag (name-only patch). Its own instance for a name-conflict-aware toast. */
export const useRenameTag = createEntityMutation<inferInput<Trpc["tag"]["updateTag"]>, unknown>({
  options: (trpc) => trpc.tag.updateTag.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't rename the label — that name may already be in use.",
});

/** Update a tag's style/behavior (color · color2 · folderType · isHiddenOnCard). */
export const useUpdateTagStyle = createEntityMutation<inferInput<Trpc["tag"]["updateTag"]>, unknown>({
  options: (trpc) => trpc.tag.updateTag.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't update the label.",
});

/** Delete a label; ConfirmDialog owns rejection feedback and retry. */
export const useRemoveTag = createEntityMutation<inferInput<Trpc["tag"]["removeTag"]>, unknown>({
  options: (trpc) => trpc.tag.removeTag.mutationOptions(),
  busDriven: true,
});

/** Merge one tag into another (re-points every attachment, then deletes the source). */
export const useMergeTags = createEntityMutation<inferInput<Trpc["tag"]["mergeTags"]>, unknown>({
  options: (trpc) => trpc.tag.mergeTags.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't merge the labels.",
});

/** Persist the manual tag order (position → sortOrder). */
export const useSetTagOrder = createEntityMutation<inferInput<Trpc["tag"]["setTagOrder"]>, unknown>({
  options: (trpc) => trpc.tag.setTagOrder.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't reorder the labels.",
});

/** Prune unused labels; ConfirmDialog owns rejection feedback and retry. */
export const usePruneUnusedTags = createEntityMutation<void, unknown>({
  options: (trpc) => trpc.tag.pruneUnusedTags.mutationOptions(),
  busDriven: true,
});
/** Apply a suggestion; the tag user-bus event refreshes both Labels and character projections. */
export const useAcceptSuggestion = createEntityMutation<inferInput<Trpc["tag"]["attachTag"]>, unknown>({
  options: (trpc) => trpc.tag.attachTag.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't accept the suggestion.",
});

/** Reject a suggestion: detach the pending tag. `busDriven` refetches the pending read. */
export const useRejectSuggestion = createEntityMutation<inferInput<Trpc["tag"]["detachTag"]>, unknown>({
  options: (trpc) => trpc.tag.detachTag.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't dismiss the suggestion.",
});
