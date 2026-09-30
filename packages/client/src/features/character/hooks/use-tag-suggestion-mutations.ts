// The on-demand character tag suggestion producer; Apply/Reject are shared tag operations.

import { CARD_NOT_DISTILLABLE_REASON } from "@orb/contracts/discovery";
import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";
import { trpcErrorReason } from "#lib";

/** The two honest failures of a "Suggest tags" run, told apart by the wire reason code — because their FIXES
 *  are opposite. A transient summarizer/provider fault is worth retrying; a name-only card is not (retrying
 *  it forever produces the same refusal), so its copy names the one thing that unblocks it. */
const SUGGEST_RETRY_COPY = "Couldn't generate tag suggestions — try again.";
const SUGGEST_NOT_DISTILLABLE_COPY = "Nothing to summarize yet — add a description to this card, then suggest tags.";

/** Run the on-demand distill producer for one card. Explicitly invalidates every pending read and the Labels census — the staging
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
  invalidates: (trpc) => [trpc.tag.listPendingSuggestions.pathFilter(), trpc.tag.listTagsWithUsage.queryFilter()],
  errorToast: (error) => (trpcErrorReason(error) === CARD_NOT_DISTILLABLE_REASON ? SUGGEST_NOT_DISTILLABLE_COPY : SUGGEST_RETRY_COPY),
});
