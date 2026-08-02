// The character-editor tag-suggestion mutations — the Accept/Reject review flow + the on-demand "Suggest
// tags" producer trigger. Accept/Reject emit `tagsChanged` on the user-bus (path-invalidates the pending
// read); Accept also explicitly invalidates `character.get` since the accepted-chip strip lives on the
// character router, which `tagsChanged` doesn't cover. Suggest stages fresh pending rows through a
// chokepoint that emits no bus event, so it invalidates the pending read explicitly.

import { CARD_NOT_DISTILLABLE_REASON } from "@orb/contracts/discovery";
import type { CharacterId } from "@orb/kit/ids";
import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

/** Accept a suggestion. `busDriven` covers the pending read; the explicit `character.get` invalidate surfaces the new accepted chip. */
export const useAcceptSuggestion = createEntityMutation<inferInput<Trpc["tag"]["attachTag"]>, unknown>({
  options: (trpc) => trpc.tag.attachTag.mutationOptions(),
  invalidates: (trpc, vars) => [trpc.character.get.queryFilter({ characterId: vars.targetId as CharacterId })],
  errorToast: "Couldn't accept the suggestion.",
});

/** Reject a suggestion: detach the pending tag. `busDriven` refetches the pending read. */
export const useRejectSuggestion = createEntityMutation<inferInput<Trpc["tag"]["detachTag"]>, unknown>({
  options: (trpc) => trpc.tag.detachTag.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't dismiss the suggestion.",
});

/** The two honest failures of a "Suggest tags" run, told apart by the wire reason code — because their FIXES
 *  are opposite. A transient summarizer/provider fault is worth retrying; a name-only card is not (retrying
 *  it forever produces the same refusal), so its copy names the one thing that unblocks it. */
const SUGGEST_RETRY_COPY = "Couldn't generate tag suggestions — try again.";
const SUGGEST_NOT_DISTILLABLE_COPY = "Nothing to summarize yet — add a description to this card, then suggest tags.";

/** The refusal reason off a tRPC error's `data.reason` (the formatter's honest domain code), else "".
 *  Mirrors `turn-abort-notice`'s reader — the client keys on the structured wire field, never message text. */
function suggestFailureReason(error: unknown): string {
  const data = typeof error === "object" && error !== null && "data" in error ? (error as { data: unknown }).data : null;
  return typeof data === "object" && data !== null && "reason" in data && typeof (data as { reason: unknown }).reason === "string"
    ? (data as { reason: string }).reason
    : "";
}

/** Run the on-demand distill producer for one card. Explicitly invalidates the pending read — the staging
 *  chokepoint emits no user-bus event.
 *
 *  This toast is the ONLY thing that tells a user the run failed, and until 2026-08-03 it never fired: the
 *  server contained the single-card failure and answered 200 with `{distilled: 0, failed: 1}`, so the button
 *  went quiet, the list refetched to the same contents, and nothing said why. The domain now throws
 *  (`DistillFailedError` → SERVICE_UNAVAILABLE; `CardNotDistillableError` → BAD_REQUEST +
 *  `card_not_distillable`), which is what makes this line live. The reason code picks the copy: "try again"
 *  would be a lie for a name-only card, whose only fix is writing the card. */
export const useSuggestCharacterTags = createEntityMutation<inferInput<Trpc["discovery"]["suggestCharacterTags"]>, unknown>({
  options: (trpc) => trpc.discovery.suggestCharacterTags.mutationOptions(),
  invalidates: (trpc, vars) => [trpc.tag.listPendingSuggestions.queryFilter({ characterId: vars.characterId })],
  errorToast: (error) => (suggestFailureReason(error) === CARD_NOT_DISTILLABLE_REASON ? SUGGEST_NOT_DISTILLABLE_COPY : SUGGEST_RETRY_COPY),
});
