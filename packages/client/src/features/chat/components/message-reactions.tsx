// B6/MR2 — the reaction PILL ROW under a committed message. Mounted through the chat `message-footer`
// surface anchor (§6c/M8), which is what structurally excludes the streaming ghost and the pre-commit draft
// rows: that seam only ever mounts against a settled `MessageView`, so there is no "is this row real yet?"
// branch to get wrong here.
//
// APPLICABILITY-GATED, never a mode ([[no-separate-reduced-modes]]): the row renders exactly when this
// variant HAS reactions and nothing at all otherwise. A room nobody has reacted in is byte-identical to a
// build without the feature — the footer band is `empty:hidden`, so an absent pill row spends no layout.
//
// EACH PILL IS A TOGGLE, NOT A BUTTON, and that is an a11y decision rather than a styling one: the control
// has a two-state model ("I have reacted" / "I have not"), which is exactly what `aria-pressed` says. That
// state is answered from the viewer's own SEAT, not from a count — a reactor total cannot tell a screen
// reader whether the press would add or remove. `Toggle size="chip"` carries the ≥44px hit floor by
// construction (`--spacing-touch-target` is the POINTER-CONDITIONAL token: 44px coarse, 28px fine), so the
// pill stays small in a dense desktop transcript and is thumb-sized on a phone with no feature-side
// pointer variant (`no-pointer-variants-in-features`).
//
// ONE LINE WITH A "+N" TAIL (the §3-S1 law-5 attention budget, applied one plane over). A brigaded message
// must not be able to wrap the transcript: the row shows the first {@link VISIBLE_CHIP_CAP} chips in their
// first-reacted order and discloses the rest as a count whose `title` names them. Deliberately NOT a
// popover: the overflow is an honest tally of a long tail nobody is reading, and a click target there would
// promise an inspection surface that MR2 does not ship.

import type { MessageReactionGroup, MessageView, ReactionEmoji } from "@orb/contracts/chat";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { Toggle } from "@orb/ui/toggle";
import type { ReactElement } from "react";
import { useInvalidation, useTRPC } from "#data";
import { useReactionsForVariant, useViewerSeatId } from "../hooks/use-message-reactions.ts";
import { useToggleReactionMutation } from "../lib/reaction-mutations.ts";

/** How many chips the row prints before the tail count. Six is what a 320px row holds beside the message
 *  it hangs off without wrapping; the rest is disclosed as "+N". */
const VISIBLE_CHIP_CAP = 6;

interface ReactionPillProps {
  readonly group: MessageReactionGroup;
  readonly viewerReacted: boolean;
  readonly onToggle: (emoji: ReactionEmoji) => void;
}

/** ONE emoji's chip: the glyph, the reactor count, and the viewer's own pressed state.
 *
 *  THE COUNT IS PRINTED, not only announced — it is the datum ("four people laughed"), and a chip that
 *  showed a bare glyph would make the row unreadable at a glance. The accessible NAME says the whole
 *  sentence because an emoji's own text is not one (§13.10 N3: stable identity first, volatile count after,
 *  so a `getByRole("button", {name: /React with/})` query survives the count changing). */
function ReactionPill({ group, viewerReacted, onToggle }: ReactionPillProps): ReactElement {
  const count = group.reactorParticipantIds.length;
  return (
    <Toggle
      aria-label={`React with ${group.emoji} — ${String(count)} so far`}
      data-slot="message-reaction-pill"
      intent="outline"
      onPressedChange={(): void => onToggle(group.emoji)}
      pressed={viewerReacted}
      shape="pill"
      size="chip"
    >
      {/* The glyph is decoration for AT — the accessible name above already says which emoji it is, and a
          screen reader announcing the raw codepoint's own name a second time is noise. */}
      <span aria-hidden={true}>{group.emoji}</span>
      <Text as="span" voice="gloss">
        {count}
      </Text>
    </Toggle>
  );
}

export interface MessageReactionsProps {
  readonly message: MessageView;
}

/**
 * The pill row for one committed message's SELECTED variant. Returns `null` — rendering nothing, not an
 * empty shell — when the variant carries no reactions, which is most rows in most rooms.
 */
export function MessageReactions({ message }: MessageReactionsProps): ReactElement | null {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const toggle = useToggleReactionMutation({ trpc, invalidation });
  const groups = useReactionsForVariant(message.chatId, message.selectedVariantId);
  const viewerSeatId = useViewerSeatId(message.chatId);

  if (groups.length === 0) {
    return null;
  }
  const shown = groups.slice(0, VISIBLE_CHIP_CAP);
  const hidden = groups.slice(VISIBLE_CHIP_CAP);
  const onToggle = (emoji: ReactionEmoji): void => {
    if (toggle.isPending) {
      return;
    }
    toggle.mutate({ chatId: message.chatId, variantId: message.selectedVariantId, emoji });
  };
  return (
    <Row align="center" data-slot="message-reactions" gap="tight">
      {shown.map((group) => (
        <ReactionPill
          group={group}
          key={group.emoji}
          onToggle={onToggle}
          viewerReacted={viewerSeatId !== null && group.reactorParticipantIds.includes(viewerSeatId)}
        />
      ))}
      {hidden.length > 0 ? (
        <Text as="span" title={hidden.map((g) => g.emoji).join(" ")} voice="gloss">
          +{hidden.length}
        </Text>
      ) : null}
    </Row>
  );
}
