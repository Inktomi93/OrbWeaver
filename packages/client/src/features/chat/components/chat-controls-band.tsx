// S1 — THE in-chat control band (interaction-direction-spec.md §3-S1): the ONE surface every transient
// control near the transcript renders through (rule chips, suggestion/confirm cards, a game's dice ask).
// Mounted once per room at the `above-composer` anchor by `lib/chat-controls-contribution.tsx`.
//
// IT OWNS THE CONSUMPTION CONTRACT, generalized from `choice-send-provider.tsx` (which stays the
// `:::choices` fence's own provider — that block is CANON-plane content, this band is the transient plane):
// its OWN `useSendMessage` instance, so a control click can never clear or race the composer's draft;
// `busy` from the shared turn phase; a compose click seeding this room's composer draft + focus. Per-mode
// operability is `lib/chat-control-availability.ts` — the one home for "is this control disabled, and why".
//
// A CHIP ALSO SHOWS ITS MODE (side-eye 2026-08-24): the mode field exists to stop send/compose confusion, but
// the chips were rendering byte-identical, so a click that POSTS looked exactly like one that only DRAFTS. So
// a chip carries a per-mode leading glyph (`MODE_GLYPH`) AND a mode-prefixed accessible name
// (`MODE_ACCNAME_PREFIX`) — the visible and the non-sighted halves of the same signal — and every disabled
// control names its unlock through `aria-describedby` (keyboard/SR-reachable), not `title` alone.
//
// THE STACKING LAW (§3-S1 + authoring law 5, the attention budget). `CHAT_CONTROL_KINDS` declares the
// stack order (cards above chips) and the renderer map below is exhaustive over it, so a new kind fails
// `tsc` until it has both. Cards: exactly ONE visible (the newest), the rest disclosed as a mono count —
// the per-arm `max(4)` bounds one rule's chips, nothing bounds N rules firing on one event. Chips: one row,
// a display cap, the remainder disclosed the same way. Card buttons are neutral/outline and each card
// carries an explicit dismiss; the composer's Send stays CONTENT's one `primary` (UI §4.3 rule 3).

import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import type { LucideIcon } from "@orb/ui/icons";
import { Pencil, Play, Send, X } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { Fragment, useId } from "react";
import type { ChatControl, ChatControlAction, ChatControlKind, ChatControlMode, ChatControlSource, ContributorRegistry } from "#lib";
import { CHAT_CONTROL_KINDS, controlOverflowNotice } from "#lib";
import { requestComposerFocus, setComposerDraft, useTurnPhase } from "#state";
import { useChatControls } from "../hooks/use-chat-controls.tsx";
import { useSendMessage } from "../hooks/use-send-message.ts";
import type { ChatControlTurnState } from "../lib/chat-control-availability.ts";
import { resolveControlAvailability } from "../lib/chat-control-availability.ts";

/** How many chips the row shows before disclosing the rest as a count (law 5 — one row, never a wall). */
const CHIP_DISPLAY_CAP = 4;
/** How many cards are visible at once. ONE, by law: the newest; the rest are a "+N pending" count. */
const CARD_DISPLAY_CAP = 1;

export interface ChatControlsBandProps {
  readonly chatId: ChatId;
  readonly sources: ContributorRegistry<ChatControlSource>;
}

/** The room's consumption capability, closed over one chat — what every click in the band routes through. */
interface ControlConsumer {
  readonly chatId: ChatId;
  readonly send: (text: string) => void;
  readonly turn: ChatControlTurnState;
}

function assertNeverMode(action: never): never {
  throw new Error(`chat-control: unhandled action mode ${JSON.stringify(action)}`);
}

/** THE CLICK. Total over the mode axis, and the mirror of `resolveControlAvailability`'s dispatch: `send`
 *  fires the text as this member's turn, `compose` seeds their draft + focuses the composer (they own and
 *  edit it), `execute` calls the source's own runner (a front-door verb, never a turn). */
function runControlAction(action: ChatControlAction, consumer: ControlConsumer): void {
  switch (action.mode) {
    case "send": {
      consumer.send(action.text);
      return;
    }
    case "compose": {
      setComposerDraft(consumer.chatId, action.text);
      requestComposerFocus(consumer.chatId);
      return;
    }
    case "execute": {
      action.run();
      return;
    }
    default: {
      assertNeverMode(action);
    }
  }
}

interface ControlActionButtonProps {
  readonly action: ChatControlAction;
  readonly consumer: ControlConsumer;
  /** `chip` is the pill in the capped row; `card` is a neutral button inside the card's action row. */
  readonly as: ChatControlKind;
}

/** The leading GLYPH per consumption mode — a chip's whole visible tell that `send` POSTS as your turn,
 *  `compose` only DRAFTS, and `execute` RUNS a verb (side-eye 2026-08-24 P1: send/compose/execute chips were
 *  byte-identical, so a "Draw your blade" send chip that fires instantly looked exactly like a "Time skip"
 *  compose chip that only drafts). Decorative — the mode is ALSO carried in the accessible name below, so the
 *  icon is `aria-hidden`. Exhaustive over the mode axis: a new `CHAT_CONTROL_MODES` member fails `tsc` here. */
const MODE_GLYPH: Record<ChatControlMode, LucideIcon> = {
  send: Send,
  compose: Pencil,
  execute: Play,
};

/** The accessible-name PREFIX per mode — the SR/keyboard half of the same signal (side-eye 2026-08-24 P1:
 *  the accessible name was label-only, so a non-sighted user got ZERO mode signal). The visible label stays
 *  the suffix, so the accessible name CONTAINS it (WCAG 2.5.3 label-in-name / voice-control match). */
const MODE_ACCNAME_PREFIX: Record<ChatControlMode, string> = {
  send: "Send",
  compose: "Draft",
  execute: "Run",
};

/** ONE affordance, in either dress. Disabled state and its REASON come from the one behavior contract, and
 *  a disabled button stays focusable so the reason is reachable without a pointer.
 *
 *  A CHIP carries the per-mode glyph + accessible-name prefix (a chip's bare label cannot tell send from
 *  compose); a CARD's action reads in the context of its title and its label is deliberate copy ("Run now"
 *  must not become "Run: Run now"), so it stays plain. The disabled REASON is bound by `aria-describedby` to
 *  a visually-hidden sibling in BOTH dresses — `title` alone is hover-only, unreachable by keyboard/SR
 *  (side-eye 2026-08-24 P2). The span is a SIBLING, never a child: inside the button it would append to the
 *  accessible name. */
function ControlActionButton({ action, consumer, as }: ControlActionButtonProps): ReactElement {
  const availability = resolveControlAvailability(action, consumer.turn);
  const chip = as === "chip";
  const reasonId = useId();
  const Glyph = MODE_GLYPH[action.mode];
  return (
    <>
      <Button
        aria-describedby={availability.reason === null ? undefined : reasonId}
        aria-label={chip ? `${MODE_ACCNAME_PREFIX[action.mode]}: ${action.label}` : undefined}
        data-mode={action.mode}
        disabled={availability.disabled}
        focusableWhenDisabled={true}
        intent={chip ? "outline" : "secondary"}
        onClick={(): void => runControlAction(action, consumer)}
        shape={chip ? "pill" : "control"}
        size={chip ? "chip" : "sm"}
        title={availability.reason ?? undefined}
      >
        {chip ? <Glyph aria-hidden={true} /> : null}
        {action.label}
      </Button>
      {availability.reason === null ? null : (
        <Text as="span" className="sr-only" id={reasonId}>
          {availability.reason}
        </Text>
      )}
    </>
  );
}

/** The undisclosed remainder, in the mono voice both stacks share. */
function OverflowCount({ hidden, noun, slot }: { readonly hidden: number; readonly noun: "pending" | "more"; readonly slot: string }): ReactElement | null {
  if (hidden <= 0) {
    return null;
  }
  return (
    <Text className="text-muted-foreground" data-slot={slot} voice="datum">
      {controlOverflowNotice(hidden, noun)}
    </Text>
  );
}

/** The CARD stack: the newest card, its actions, its dismiss — and the count of the ones behind it. */
function ControlCards({ controls, consumer }: { readonly controls: readonly ChatControl[]; readonly consumer: ControlConsumer }): ReactElement | null {
  const cards = controls.filter((control) => control.kind === "card");
  const newest = cards.at(-1);
  if (newest === undefined) {
    return null;
  }
  return (
    <Stack data-slot="chat-control-cards" gap="row">
      {/* The HAIRLINE ACCENT edge is the card's whole visual claim on attention: one border-weight step in
          the accent, never a filled CTA — the composer's Send is the room's one primary. */}
      <Card className="border border-primary/40">
        <Stack gap="field">
          <Row align="center" gap="row" justify="between">
            <Text voice="label">{newest.title}</Text>
            <Button aria-label={`Dismiss ${newest.title}`} intent="ghost" onClick={newest.dismiss} size="glyph-sm" title={`Dismiss ${newest.title}`}>
              <X aria-hidden={true} />
            </Button>
          </Row>
          {newest.detail}
          <Row gap="field">
            {/* Keyed by the action's OWN id, never its label: a card may legitimately carry two
                same-labelled actions (two "Apply" rows over different targets), and a label key collides
                them into one — which is why the id is a required field on the descriptor. */}
            {newest.actions.map((action) => (
              <ControlActionButton action={action} as="card" consumer={consumer} key={action.id} />
            ))}
          </Row>
        </Stack>
      </Card>
      <OverflowCount hidden={cards.length - CARD_DISPLAY_CAP} noun="pending" slot="chat-control-cards-overflow" />
    </Stack>
  );
}

/** The CHIP row: capped, remainder disclosed — and it WRAPS. At a phone width four long-label chips overrun
 *  the available inline space and an ancestor clips the overflow, so the "+N more" disclosure (and later
 *  chips) were pushed off the right edge, unreachable with no scrollbar (side-eye 2026-08-24 P3). A second
 *  line is cheap above the composer, so the row wraps rather than clips — every capped chip and its
 *  disclosure stay on screen. */
function ControlChips({ controls, consumer }: { readonly controls: readonly ChatControl[]; readonly consumer: ControlConsumer }): ReactElement | null {
  const chips = controls.filter((control) => control.kind === "chip");
  if (chips.length === 0) {
    return null;
  }
  return (
    <Row align="center" className="flex-wrap" data-slot="chat-control-chips" gap="field">
      {chips.slice(0, CHIP_DISPLAY_CAP).map((chip) => (
        <ControlActionButton action={chip.action} as="chip" consumer={consumer} key={chip.id} />
      ))}
      <OverflowCount hidden={chips.length - CHIP_DISPLAY_CAP} noun="more" slot="chat-control-chips-overflow" />
    </Row>
  );
}

/** The stack, exhaustive over the kind axis — declared order IS render order (cards above chips). */
const KIND_STACK: Record<ChatControlKind, (controls: readonly ChatControl[], consumer: ControlConsumer) => ReactNode> = {
  card: (controls, consumer) => <ControlCards consumer={consumer} controls={controls} />,
  chip: (controls, consumer) => <ControlChips consumer={consumer} controls={controls} />,
};

/** The band. Zero live controls ⇒ NO `chat-controls` element at all: the source mounts render null, so the
 *  room's above-composer wrapper is left EMPTY, and that wrapper's `empty:hidden` collapses it out of the
 *  room's flex column (`chat-room-surface.tsx`) — a registered-but-silent source costs no box and no gap,
 *  which is the same property zero sources gets from the mount's `when`. */
export function ChatControlsBand({ chatId, sources }: ChatControlsBandProps): ReactElement {
  const phase = useTurnPhase(chatId);
  // Its OWN send instance (the `ChoiceSendProvider` rule): a control click must never clear or race the
  // composer's draft, and its in-flight window is part of THIS band's busy state.
  const sender = useSendMessage({ chatId });
  const { controls, mounts } = useChatControls(sources, { chatId });
  const consumer: ControlConsumer = {
    chatId,
    send: sender.send,
    turn: { turnBusy: phase === "pending" || phase === "streaming" || phase === "stopping" || sender.isPending },
  };
  return (
    <>
      {/* The source fibers sit OUTSIDE the painted box and render null — so "nothing published" leaves an
          empty wrapper rather than a box with an invisible child, and the collapse above can fire. */}
      {mounts}
      {controls.length === 0 ? null : (
        <Stack data-slot="chat-controls" gap="row">
          {CHAT_CONTROL_KINDS.map((kind) => (
            <Fragment key={kind}>{KIND_STACK[kind](controls, consumer)}</Fragment>
          ))}
        </Stack>
      )}
    </>
  );
}
