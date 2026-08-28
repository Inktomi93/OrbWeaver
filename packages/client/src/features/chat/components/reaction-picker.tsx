// B6/MR2 — the reaction PICKER: the emoji vocabulary as a pickable grid, opened from either of the message
// row's two doors.
//
// ONE SURFACE, TWO DOORS (and the deviation from the spec's letter is stated, not silent). §7-B6 asks for a
// "hover cluster at fine, INSIDE the ⋯ row menu at coarse". Both DOORS are built exactly that way
// (`message-actions-row.tsx`: an inline glyph wearing `ROW_ACTION_INLINE`, plus a `MenuItem` present at
// every pointer by the mirror-parity ruling). What is NOT built is a second SURFACE per door: an anchored
// popover is structurally unavailable to the coarse door, because `ROW_ACTION_INLINE` is `display:none` and
// Base UI positions a popover against its trigger's box — a `display:none` trigger has none. The choice was
// therefore a popover-plus-a-dialog (one picker rendered twice, two skins to keep in step) or ONE dialog
// both doors open. The dialog is the row's OWN precedent for exactly this problem — `VariantWireViewer` is a
// sibling of the menu, for the same reason (a `MenuItem` click closes the menu and would unmount a popup
// rendered inside it) — so the picker follows it.
//
// THE GRID IS THE CONTRACT'S VOCABULARY, iterated (`REACTION_EMOJIS`), never a second list: the wire enum
// refuses anything else, so a hand-kept picker list could only ever be a list of tokens the server rejects.
// Widening the vocabulary widens this grid, in one edit, with no client change at all.
//
// PRESSED STATE IS REAL HERE TOO. The grid shows which emoji the VIEWER already has on this variant, so the
// picker doubles as the un-react path for a reaction whose pill has scrolled behind the "+N" tail. Same
// toggle verb, same seat, same answer — there is no second write path to keep honest.

import type { MessageReactionGroup, ReactionEmoji } from "@orb/contracts/chat";
import { REACTION_EMOJIS } from "@orb/contracts/chat";
import type { ChatId, ChatParticipantId, MessageVariantId } from "@orb/kit/ids";
import { Dialog, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { Toggle } from "@orb/ui/toggle";
import type { ReactElement } from "react";

export interface ReactionPickerProps {
  readonly chatId: ChatId;
  readonly variantId: MessageVariantId;
  /** The viewer's own seat, or `null` while the room read is in flight — a null seat simply means no cell
   *  reads as pressed yet; it never disables the picker, because the SERVER resolves the seat on the write. */
  readonly viewerSeatId: ChatParticipantId | null;
  /** This variant's current groups — the source of the pressed state (the pill row's own selector). */
  readonly groups: readonly MessageReactionGroup[];
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onPick: (emoji: ReactionEmoji) => void;
}

/**
 * The emoji grid. Picking CLOSES the dialog: one reaction per visit is the whole interaction, and leaving it
 * open after a pick would leave the reader looking at a surface whose result is behind it.
 */
export function ReactionPicker({ chatId, groups, onOpenChange, onPick, open, variantId, viewerSeatId }: ReactionPickerProps): ReactElement {
  const reactedWith = new Set(groups.filter((g) => viewerSeatId !== null && g.reactorParticipantIds.includes(viewerSeatId)).map((g) => g.emoji));
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogPopup data-slot="reaction-picker" data-chat-id={chatId} data-variant-id={variantId}>
        <Stack gap="block">
          <DialogTitle>Add a reaction</DialogTitle>
          {/* `wrap` is the grid: ten cells at a ≥44px coarse floor cannot hold one line on a phone, and a
              wrapping rail is what the chip box is FOR (`CHIP_BOX` is one home with Button's `chip` size,
              which is the wrapping-rail cell). */}
          <Row align="center" className="flex-wrap" gap="field">
            {REACTION_EMOJIS.map((emoji) => (
              <Toggle
                aria-label={`React with ${emoji}`}
                intent="outline"
                key={emoji}
                onPressedChange={(): void => {
                  onPick(emoji);
                  onOpenChange(false);
                }}
                pressed={reactedWith.has(emoji)}
                shape="pill"
                size="chip"
              >
                <span aria-hidden={true}>{emoji}</span>
              </Toggle>
            ))}
          </Row>
          <Text voice="gloss">Everyone in this room sees reactions.</Text>
        </Stack>
      </DialogPopup>
    </Dialog>
  );
}
