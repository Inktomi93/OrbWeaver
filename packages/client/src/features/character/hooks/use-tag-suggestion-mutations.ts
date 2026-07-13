// The character-editor tag-suggestion mutations — the Accept/Reject review flow + the on-demand "Suggest
// tags" producer trigger. Accept/Reject emit `tagsChanged` on the user-bus (path-invalidates the pending
// read); Accept also explicitly invalidates `character.get` since the accepted-chip strip lives on the
// character router, which `tagsChanged` doesn't cover. Suggest stages fresh pending rows through a
// chokepoint that emits no bus event, so it invalidates the pending read explicitly.

import type { CharacterId } from "@orb/kit/ids";
import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

/** Accept a suggestion. `busDriven` covers the pending read; the explicit `character.get` invalidate surfaces the new accepted chip. */
export const useAcceptSuggestion = createEntityMutation<
  inferInput<Trpc["tag"]["attachTag"]>,
  unknown
>({
  options: (trpc) => trpc.tag.attachTag.mutationOptions(),
  invalidates: (trpc, vars) => [
    trpc.character.get.queryFilter({ characterId: vars.targetId as CharacterId }),
  ],
  errorToast: "Couldn't accept the suggestion.",
});

/** Reject a suggestion: detach the pending tag. `busDriven` refetches the pending read. */
export const useRejectSuggestion = createEntityMutation<
  inferInput<Trpc["tag"]["detachTag"]>,
  unknown
>({
  options: (trpc) => trpc.tag.detachTag.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't dismiss the suggestion.",
});

/** Run the on-demand distill producer for one card. Explicitly invalidates the pending read — the staging
 *  chokepoint emits no user-bus event. */
export const useSuggestCharacterTags = createEntityMutation<
  inferInput<Trpc["discovery"]["suggestCharacterTags"]>,
  unknown
>({
  options: (trpc) => trpc.discovery.suggestCharacterTags.mutationOptions(),
  invalidates: (trpc, vars) => [
    trpc.tag.listPendingSuggestions.queryFilter({ characterId: vars.characterId }),
  ],
  errorToast: "Couldn't generate tag suggestions.",
});
