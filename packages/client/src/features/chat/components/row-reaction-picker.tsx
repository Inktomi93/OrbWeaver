// The message row's picker MOUNT (B6 door → B7 segment wiring) — split out of `message-actions-row.tsx`
// under the component-size cap (the house sub-file move), and OWNING its own toggle mutation: it exists
// only while the picker is open, so the mutation's lifetime matches its one consumer.
//
// THE PARSE INPUTS MIRROR THE SERVER'S WRITE VALIDATION EXACTLY: the picker parses the variant's CANON
// (`message.content`, never display text) with the cast names under the SAME `isNarratorVoiced` gate the
// server's `resolveSegmentClaim` applies — which is what makes a picked segment index survive the round
// trip instead of refusing `invalid_segment`. Mount discipline is the CALLER's (`pickerOpen ? … : null` —
// an unopened row builds no picker subtree), so `open` is pinned true here.

import type { MessageView } from "@orb/contracts/chat";
import { isNarratorVoiced } from "@orb/contracts/chat";
import type { ReactElement } from "react";
import { useInvalidation, useTRPC } from "#data";
import { useToggleReactionMutation } from "../lib/reaction-mutations.ts";
import { ReactionPicker } from "./reaction-picker.tsx";

export interface RowReactionPickerProps {
  readonly message: MessageView;
  readonly characterNames: readonly string[];
  readonly groups: Parameters<typeof ReactionPicker>[0]["groups"];
  readonly viewerSeatId: Parameters<typeof ReactionPicker>[0]["viewerSeatId"];
  readonly onOpenChange: (open: boolean) => void;
}

/** The picker wired to the row's message: a whole-message pick sends the bare toggle, a segment pick
 *  carries the CLAIM (index + the span's speaker) the server re-validates against its own canon parse. */
export function RowReactionPicker({ message, characterNames, groups, viewerSeatId, onOpenChange }: RowReactionPickerProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const toggleReaction = useToggleReactionMutation({ trpc, invalidation });
  return (
    <ReactionPicker
      characterNames={isNarratorVoiced(message.kind) ? characterNames : []}
      chatId={message.chatId}
      content={message.content}
      groups={groups}
      onOpenChange={onOpenChange}
      onPick={(emoji, segment): void => {
        if (!toggleReaction.isPending) {
          toggleReaction.mutate({
            chatId: message.chatId,
            variantId: message.selectedVariantId,
            emoji,
            ...(segment !== null ? { segmentIndex: segment.index, segmentSpeaker: segment.speaker } : {}),
          });
        }
      }}
      open={true}
      variantId={message.selectedVariantId}
      viewerSeatId={viewerSeatId}
    />
  );
}
