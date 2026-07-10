// The character-editor tag-SUGGESTION mutations (the Accept/Reject review flow + the on-demand "Suggest tags"
// producer trigger). One `createEntityMutation` per verb, mirroring use-character-mutations.ts.
//
// Accept = `tag.attachTag(status:'accepted')` (flips the pending junction row to accepted); Reject =
// `tag.detachTag`. Both emit `tagsChanged` on the user-bus, whose ALWAYS-ON subscription (home-page.tsx)
// path-invalidates the WHOLE `tag` router — so the pending-suggestion read refetches for free (the same
// `busDriven` posture as use-tag-settings-mutations). Accept ALSO invalidates `character.get`: the accepted
// chip strip (CharacterTagsRow reads `CharacterDetail.tags`, accepted-only) lives on the CHARACTER router,
// which `tagsChanged` does NOT cover — so the newly-accepted tag needs that explicit refetch to appear.
//
// Suggest = `discovery.suggestCharacterTags` (the PD-40 distill producer, on-demand for ONE card). It stages
// `source:'auto', status:'pending'` rows through the tag by-name chokepoint, which emits NO user-bus event —
// so the pending read is invalidated EXPLICITLY here (nothing reconciles it otherwise).

import type { CharacterId } from "@orb/kit/ids";
import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

/** Accept a suggestion: flip its pending junction row to `accepted`. `busDriven` covers the pending read (the
 *  `tagsChanged` bus); the explicit `character.get` invalidate surfaces the new accepted chip (not bus-covered). */
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

/** Reject a suggestion: detach the pending tag. `busDriven` — `tagsChanged` refetches the pending read; the
 *  accepted chips are unaffected (a pending tag was never on the card). */
export const useRejectSuggestion = createEntityMutation<
  inferInput<Trpc["tag"]["detachTag"]>,
  unknown
>({
  options: (trpc) => trpc.tag.detachTag.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't dismiss the suggestion.",
});

/** Run the on-demand distill producer for ONE card (stages fresh `pending` suggestions). Explicitly
 *  invalidates the pending read — the staging chokepoint emits no user-bus event, so nothing else reconciles it. */
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
