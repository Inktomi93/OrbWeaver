// B6/MR2 — the reaction PICKER: the emoji vocabulary as a pickable grid, opened from either of the message
// row's two doors. B7/MR3 adds the TARGET row: react to the whole message (the default at every pointer —
// the spec's "whole-message default at coarse" is satisfied by defaulting everywhere) or to ONE speaker's
// line of a multi-speaker body.
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
// THE TARGET LIST IS THE CANON PARSE, not the display parse: `parseSpeakerSpans` over the stored
// `content` with the character names the caller threads (narrator-gated upstream) — the IDENTICAL inputs the
// server's write validation runs (`verbs/reactions.ts::resolveSegmentClaim`), which is what makes a picked
// index survive the round trip instead of refusing `invalid_segment`. Display regex/macros can reshape the
// RENDERED body (`message-content.tsx` parses that), so a display-derived index would be a different
// segmentation than the one the server stores against.
//
// THE GRID IS THE CONTRACT'S VOCABULARY, iterated (`REACTION_EMOJIS`), never a second list: the wire enum
// refuses anything else, so a hand-kept picker list could only ever be a list of tokens the server rejects.
// Widening the vocabulary widens this grid, in one edit, with no client change at all.
//
// PRESSED STATE IS REAL HERE TOO — per TARGET: the grid shows which emoji the VIEWER already has on this
// variant for the SELECTED target (whole-message vs one line are independent toggles, MA-2 §4), so the
// picker doubles as the un-react path for a reaction whose pill has scrolled behind the "+N" tail. Same
// toggle verb, same seat, same answer — there is no second write path to keep honest.

import type { MessageReactionGroup, ReactionEmoji } from "@orb/contracts/chat";
import { REACTION_EMOJIS } from "@orb/contracts/chat";
import type { ChatId, ChatParticipantId, MessageVariantId } from "@orb/kit/ids";
import { parseSpeakerSpans } from "@orb/kit/speaker-label";
// @orb-waive dialog-via-composite(Dialog): this one-press emoji grid is a picker whose coarse trigger has no anchor box; ends if a picker composite supports both row doors.
import { Dialog, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { Toggle } from "@orb/ui/toggle";
import type { ReactElement } from "react";
import { useState } from "react";

/** The picked segment target: a span index + that span's speaker (the CLAIM the server re-validates). */
interface ReactionSegmentTarget {
  readonly index: number;
  readonly speaker: string | null;
}

export interface ReactionPickerProps {
  readonly chatId: ChatId;
  readonly variantId: MessageVariantId;
  /** The variant's STORED canon body — the segment-target parse substrate (see the header). */
  readonly content: string;
  /** The room's present characters names, already narrator-gated by the caller (`[]` on a non-narrator row). */
  readonly characterNames: readonly string[];
  /** The viewer's own seat, or `null` while the room read is in flight — a null seat simply means no cell
   *  reads as pressed yet; it never disables the picker, because the SERVER resolves the seat on the write. */
  readonly viewerSeatId: ChatParticipantId | null;
  /** This variant's current groups — the source of the pressed state (the pill row's own selector). */
  readonly groups: readonly MessageReactionGroup[];
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onPick: (emoji: ReactionEmoji, segment: ReactionSegmentTarget | null) => void;
}

/** The speaker-line targets a body offers: every span with a NAMED speaker (narration spans are reachable
 *  as "the whole message" — the spec's target is "one speaker's line", and a target list that also offered
 *  anonymous narration slices would mostly be noise). Empty for a single-span / tagless-unmatched body —
 *  the target row simply doesn't render and the picker behaves exactly as B6 shipped it. */
function speakerTargets(
  content: string,
  characterNames: readonly string[],
): readonly { readonly index: number; readonly speaker: string; readonly text: string }[] {
  return parseSpeakerSpans(content, characterNames).flatMap((span, index) =>
    span.speaker === null ? [] : [{ index, speaker: span.speaker, text: span.text }],
  );
}

/**
 * The emoji grid + (B7) the target row. Picking CLOSES the dialog: one reaction per visit is the whole
 * interaction, and leaving it open after a pick would leave the reader looking at a surface whose result is
 * behind it.
 */
export function ReactionPicker({
  characterNames,
  chatId,
  content,
  groups,
  onOpenChange,
  onPick,
  open,
  variantId,
  viewerSeatId,
}: ReactionPickerProps): ReactElement {
  // Whole-message is the DEFAULT target (null) — a segment is an explicit narrowing per visit.
  const [target, setTarget] = useState<ReactionSegmentTarget | null>(null);
  const targets = speakerTargets(content, characterNames);
  // Pressed state is per-TARGET: a whole-message 😂 and a line-anchored 😂 are different rows.
  const reactedWith = new Set(
    groups
      .filter((g) => viewerSeatId !== null && g.reactorParticipantIds.includes(viewerSeatId) && g.segmentIndex === (target?.index ?? null))
      .map((g) => g.emoji),
  );
  return (
    <Dialog
      // THE TARGET IS PER VISIT, AND CLOSING ENDS THE VISIT (#1502). The header above already states the
      // rule — "whole-message is the DEFAULT target; a segment is an explicit narrowing per visit" — but
      // the state outlived the dialog: this component stays mounted with `open=false` (the popup content is
      // what Base UI unmounts), so a line-anchored pick, a dismiss, and a reopen on a DIFFERENT message
      // came back still aimed at "segment 3" of a message that may not have three lines. Resetting on the
      // CLOSE edge rather than the open one keeps the default true even for a reopen that never re-renders
      // this subtree in between.
      onOpenChange={(next): void => {
        if (!next) {
          setTarget(null);
        }
        onOpenChange(next);
      }}
      open={open}
    >
      <DialogPopup data-slot="reaction-picker" data-chat-id={chatId} data-variant-id={variantId}>
        <Stack gap="block">
          <DialogTitle>Add a reaction</DialogTitle>
          {targets.length > 0 ? (
            // The TARGET row (B7/MR3): whole-message first (the default), then one chip per named line.
            // A wrapping rail like the grid below; `title` carries the line's text so same-name lines are
            // tellable apart without widening the chip.
            <Row align="center" className="flex-wrap" gap="field">
              <Toggle
                aria-label="React to the whole message"
                intent="outline"
                onPressedChange={(): void => setTarget(null)}
                pressed={target === null}
                shape="pill"
                size="chip"
              >
                Whole message
              </Toggle>
              {targets.map((t) => (
                <Toggle
                  aria-label={`React to ${t.speaker}'s line`}
                  intent="outline"
                  key={t.index}
                  onPressedChange={(): void => setTarget({ index: t.index, speaker: t.speaker })}
                  pressed={target?.index === t.index}
                  shape="pill"
                  size="chip"
                  title={t.text.trim()}
                >
                  {t.speaker}
                </Toggle>
              ))}
            </Row>
          ) : null}
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
                  onPick(emoji, target);
                  // A PROGRAMMATIC close never reaches the Dialog's own `onOpenChange`, so the per-visit
                  // reset has to happen here too — this is the path a successful pick actually takes.
                  setTarget(null);
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
