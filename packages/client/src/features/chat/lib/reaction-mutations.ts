// B6/MR2 — the ONE reaction write hook, shared by the pill row and the picker.
//
// ONE WRITE PATH, two surfaces. A pill press and a picker cell press are the same act, and giving each its
// own mutation would give each its own chance to drift on the two things that are easy to get wrong here:
// `busDriven` (the freshness driver is `reactionsChanged`, the SAME wire that repaints every OTHER member's
// transcript — naming filters here would repaint only the clicking tab and quietly make the second-device
// case a page-refresh feature) and the toast copy.
//
// `emoji` IS THE WIRE VOCABULARY, end to end. The proc's input, the grouped read projection and these vars
// are all `ReactionEmoji` — ONE union, so a widened vocabulary reaches the picker, the pills and the toggle
// through a single contracts edit. The read side earns that type at the server's own parse seam
// (`verbs/reactions.ts::groupReactions` drops a token the vocabulary no longer knows), which is what keeps
// this from being a cast dressed as a type.

import type { ReactionEmoji } from "@orb/contracts/chat";
import type { ChatId, MessageVariantId } from "@orb/kit/ids";
import { createEntityMutation } from "#data";

export interface ToggleReactionVars {
  readonly chatId: ChatId;
  readonly variantId: MessageVariantId;
  readonly emoji: ReactionEmoji;
}

export const useToggleReactionMutation = createEntityMutation<ToggleReactionVars, unknown>({
  options: (trpc) => trpc.chat.toggleReaction.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't change that reaction.",
});
