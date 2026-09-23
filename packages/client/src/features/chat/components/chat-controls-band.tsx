// S1 — THE in-chat control band: the ONE surface every transient
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
// a chip carries a per-mode leading glyph (`MODE_GLYPH`) AND the mode WORD (`CONTROL_MODE_WORD`), rendered as
// its kicker and reused as the accessible name's prefix — a SHAPE channel and a TEXT channel, because the
// glyph pair alone was still the "distinguished by one 16px silhouette" defect (#684 P1) — and every disabled
// control names its unlock through `aria-describedby` (keyboard/SR-reachable), not `title` alone.
//
// THE STACKING LAW (§3-S1 + authoring law 5, the attention budget). `CHAT_CONTROL_KINDS` declares the
// stack order (cards above chips) and the renderer map below is exhaustive over it, so a new kind fails
// `tsc` until it has both. Cards: exactly ONE visible (the newest), the rest disclosed as a mono count —
// the per-arm `max(4)` bounds one rule's chips, nothing bounds N rules firing on one event. Chips: one row,
// a display cap, the remainder behind an EXPANDER (#684 P2 — a count is a dead end when the hidden chips are
// another rule's vote options). Card buttons are neutral/outline and each card
// carries an explicit dismiss; the composer's Send stays CONTENT's one `primary` (UI §4.3 rule 3).
//
// THE BAND OWNS THE READING SURFACE, not the controls on it (#674 — `BAND_READING_SURFACE` below states the
// measurement and why it is the composer's opaque recipe rather than the transcript's translucent plate).
// One treatment at the anchor covers chips, cards, and every future S1 control; per-control backings would
// be the tenth bespoke answer to the same over-art question.

import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import type { LucideIcon } from "@orb/ui/icons";
import { Icon, Pencil, Play, Send, X } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { Fragment, useId, useState } from "react";
import { HIDE_AT_COARSE, SHOW_ONLY_AT_COARSE } from "#components";
import type { ChatControl, ChatControlAction, ChatControlKind, ChatControlMode, ChatControlSource, ContributorRegistry } from "#lib";
import { CHAT_CONTROL_KINDS, CONTROL_CHIPS_COLLAPSE, CONTROL_MODE_CONSEQUENCE, CONTROL_MODE_WORD, controlOverflowNotice, controlStripNotice } from "#lib";
import { requestComposerFocus, setComposerDraft, useTurnPhase } from "#state";
import { useChatControls } from "../hooks/use-chat-controls.tsx";
import { useSendMessage } from "../hooks/use-send-message.ts";
import type { ChatControlTurnState } from "../lib/chat-control-availability.ts";
import { resolveControlAvailability } from "../lib/chat-control-availability.ts";

/** How many chips the row shows before disclosing the rest as a count (law 5 — one row, never a wall). */
const CHIP_DISPLAY_CAP = 4;
/** How many cards are visible at once. ONE, by law: the newest; the rest are a "+N pending" count. */
const CARD_DISPLAY_CAP = 1;

// The transcript's reading-port floor this band's coarse strip protects is asserted from rendered geometry
// by `chat-controls-band.ct.tsx`; the numeric budget belongs to that test because production never reads it.

/** THE BAND'S READING SURFACE (#674 — the over-art contrast family's TENTH instance, and the reason it is
 *  answered HERE rather than on the chips). Measured live 2026-08-24 in a carried-art room
 *  (`data-has-bg-image`, `snap --contrast --contrast-pixel`, settled): the chip row read **1.01–1.63:1**.
 *  The cause was not the chip's ink — it was that the band had NO SURFACE. Every ancestor from
 *  `[data-slot=chat-control-chips]` up resolved `rgba(0,0,0,0)` with no `backdrop-filter`, so an
 *  `intent="outline"` chip (`bg-transparent`, `text-muted-foreground`) drew its border and its label
 *  straight onto the room's photograph. Its two neighbours in the same column both own a surface — the
 *  transcript's bubble/plate, the composer's opaque card — and the band between them owned none.
 *
 *  IT IS THE COMPOSER'S OWN RECIPE, NOT AN ELEVENTH BESPOKE `bg-*`. `composer-drop-target.tsx` states the
 *  rule this takes: "Reading-surface rule (D44 §12.1): the composer carries its OWN opaque backing
 *  (`bg-card`), never leaning on the background scrim for legibility" — minted when a TRANSLUCENT tint left
 *  typed text unreadable over a bright picture at scrim 0. The S1 band is the composer's own footer
 *  neighbour and hosts the same thing (operable controls, not prose), so it takes the same surface: one
 *  reading, one object, and the two rows of the footer read as one cluster instead of two paints.
 *
 *  WHY OPAQUE AND NOT THE TRANSLUCENT `--color-reading-plate` (the transcript's member of this family).
 *  The plate carries a PROVEN alpha floor, but the thing it is proven for is the transcript's ink set —
 *  `palette-contrast.suite.test.ts` floors the derived `foreground` and the four prose inks over the plate
 *  over worst-case art, and D144(d)/#217 record a STATED dark-arm hole for inks outside that set. A chip's
 *  ink is `text-muted-foreground`, which is not in it. That token's AA floor IS proven against
 *  `color.card` — on the seeds (the `bodyPairs` table) and on every realistic derived base (the
 *  clamp-derived sweep) — so `bg-card` is the surface whose contrast guarantee already covers what this
 *  band actually paints, and being opaque the guarantee is a CONSTRUCTION rather than a composite that a
 *  bright pixel can erode.
 *
 *  UNCONDITIONAL, not `in-data-[has-bg-image]`-gated like the transcript's plates, for the same reason the
 *  composer's is: a control band's legibility must not be a function of whether the room happens to carry
 *  art, and the padding this recipe brings would otherwise appear and disappear with the wallpaper.
 *
 *  IT COVERS THE WHOLE BAND, so it fixes the chips, the S4 cards and every future S1 control at once — the
 *  family remedy at the ANCHOR. It cannot paint an empty strip: the band renders NO `chat-controls` element
 *  at all when nothing is live (see `ChatControlsBand` below), so a silent room is byte-identical.
 *
 *  AND IT DECLARES THE INK THAT PAIRS WITH THE SURFACE (#684 P3 — the latent half of the same family). A
 *  surface without an ink is only half a reading surface: text inside it INHERITS colour from wherever the
 *  band happens to be mounted, and this band is mounted inside the room's `ThemeScope`, so a carried palette
 *  can hand it an ink derived against a background this box does not paint (a probe span measured 1.1:1
 *  across that boundary). Every band text sets its own ink TODAY, which is exactly why this is a defence and
 *  not a bug fix: `ChatControl.detail` is an arbitrary `ReactNode` a SOURCE supplies, so the one text node
 *  the band cannot style is the one a feature outside chat wrote. `text-card-foreground` is the ink the
 *  `bg-card` guarantee is stated for (the `@orb/ui` Card's own base pairs the two), so the box now carries
 *  both halves of one contract and an unstyled child lands on the proven pair. */
const BAND_READING_SURFACE = "rounded-card border border-border bg-card px-field py-field text-card-foreground";

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
  /** #2426 — the chip row's per-pointer stand-down fragment (`HIDE_AT_COARSE`), or nothing. It rides the
   *  chip rather than a wrapper element on purpose: a wrapper would give the disclosure a sibling box to
   *  be pushed past at a FINE pointer, which is the 2026-08-24 P3 defect the wrapping row exists to
   *  prevent. REQUIRED, and `""` where there is nothing to say: `exactOptionalPropertyTypes` makes an
   *  explicit `undefined` a different shape from an absent key, and one required string keeps every call
   *  site honest about which arm it is in. */
  readonly className: string;
}

/** The leading GLYPH per consumption mode — one half of a chip's visible tell that `send` POSTS as your turn,
 *  `compose` only DRAFTS, and `execute` RUNS a verb (side-eye 2026-08-24 P1: send/compose/execute chips were
 *  byte-identical, so a "Draw your blade" send chip that fires instantly looked exactly like a "Time skip"
 *  compose chip that only drafts). Decorative — the mode is ALSO carried in the accessible name below, so the
 *  icon is `aria-hidden`. Exhaustive over the mode axis: a new `CHAT_CONTROL_MODES` member fails `tsc` here. */
const MODE_GLYPH: Record<ChatControlMode, LucideIcon> = {
  send: Send,
  compose: Pencil,
  execute: Play,
};

/** ONE affordance, in either dress. Disabled state and its REASON come from the one behavior contract, and
 *  a disabled button stays focusable so the reason is reachable without a pointer.
 *
 *  A CHIP carries the per-mode glyph AND the per-mode WORD (a chip's bare label cannot tell send from
 *  compose); a CARD's action reads in the context of its title and its label is deliberate copy ("Run now"
 *  must not become "Run Run now"), so it stays plain. The disabled REASON is bound by `aria-describedby` to
 *  a visually-hidden sibling in BOTH dresses — `title` alone is hover-only, unreachable by keyboard/SR
 *  (side-eye 2026-08-24 P2). The span is a SIBLING, never a child: inside the button it would append to the
 *  accessible name.
 *
 *  `title` IS ALWAYS SET (#674 P3). It used to appear only on a DISABLED control, so an operable chip named
 *  its consequence nowhere on the pointer path — and `send` posts a turn the instant it is clicked, with no
 *  confirm step. The disabled REASON still wins the slot (a blocked affordance owes its unlock first); an
 *  enabled one falls through to `CONTROL_MODE_CONSEQUENCE`, the mode's one-line cost, homed in the copy file
 *  beside every other enabled-row helper. Deliberately BOTH dresses: a card's action is the same three modes,
 *  and `title` is a hover helper rather than the accessible name — so unlike the chip-only name prefix it
 *  cannot turn a card's deliberate label into "Run Run now".
 *
 *  THE MODE IS A WORD, NOT ONLY A SILHOUETTE (#684 P1). The glyph pair shipped by #674 is a SHAPE channel,
 *  and "never by colour alone" generalises to it: 16px of Send-arrow vs Pencil is a smaller distinction than
 *  the colour rule already forbids, and the consequence it gates is irreversible (a send chip posts a turn
 *  with no confirm). So the chip renders `CONTROL_MODE_WORD` as its own leading kicker — a text channel that
 *  survives greyscale, low vision, an icon font that fails to load, and a reader who has never met the glyph.
 *  The alternative arm — distinct chip INTENTS (a coloured send pill) — was refused twice over: it is the
 *  colour-alone channel wearing a new hat, and a filled send pill next to the composer would be a second
 *  `primary` (UI §4.3 rule 3, the law the #670-era no-box-colour call rests on). The accessible name is the
 *  SAME word + the label, with NO separator punctuation, so the whole visible string is a substring of the
 *  name (WCAG 2.5.3 label-in-name — a "Send: …" name beside a "Send …" visible label would not be).
 *
 *  THE CHIP GLYPH IS SIZED AT THE CALL SITE (#674 P2). A bare lucide component renders at its intrinsic 24px;
 *  the house body-adjacent step is 16px (`ICON_SM`, `Icon size="sm"`). The fix belongs here and NOT on
 *  `@orb/ui` Button's base — a `[&_svg]:size-*` rule there would resize every bare glyph in the app. */
function ControlActionButton({ action, consumer, as, className }: ControlActionButtonProps): ReactElement {
  const availability = resolveControlAvailability(action, consumer.turn);
  const chip = as === "chip";
  const reasonId = useId();
  const Glyph = MODE_GLYPH[action.mode];
  return (
    <>
      <Button
        aria-describedby={availability.reason === null ? undefined : reasonId}
        aria-label={chip ? `${CONTROL_MODE_WORD[action.mode]} ${action.label}` : undefined}
        className={className}
        data-mode={action.mode}
        disabled={availability.disabled}
        focusableWhenDisabled={true}
        intent={chip ? "outline" : "secondary"}
        onClick={(): void => runControlAction(action, consumer)}
        shape={chip ? "pill" : "control"}
        size={chip ? "chip" : "sm"}
        title={availability.reason ?? CONTROL_MODE_CONSEQUENCE[action.mode]}
      >
        {chip ? (
          <>
            <Icon icon={Glyph} size="sm" />
            {/* `interactiveKicker` is the voice for "a kicker that IS the visible label of a control" — the
                mode reads as the chip's register mark, not as a second label competing with the copy. No
                `data-slot` override (Text owns `data-slot=text`, which tiers.css reads): the word is
                addressable as the chip's own rendered text, which is the channel under test anyway. */}
            <Text as="span" voice="interactiveKicker" ink="inherit">
              {CONTROL_MODE_WORD[action.mode]}
            </Text>
          </>
        ) : null}
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
              {/* `glyph-sm` is a 20px box that holds a 12px `xs` Icon (the token's own description) — a bare
                  lucide glyph renders at 24px and overflowed it. Same call-site sizing rule as the chip's. */}
              <Icon icon={X} size="xs" />
            </Button>
          </Row>
          {newest.detail}
          <Row gap="field">
            {/* Keyed by the action's OWN id, never its label: a card may legitimately carry two
                same-labelled actions (two "Apply" rows over different targets), and a label key collides
                them into one — which is why the id is a required field on the descriptor. */}
            {newest.actions.map((action) => (
              <ControlActionButton action={action} as="card" className="" consumer={consumer} key={action.id} />
            ))}
          </Row>
        </Stack>
      </Card>
      <OverflowCount hidden={cards.length - CARD_DISPLAY_CAP} noun="pending" slot="chat-control-cards-overflow" />
    </Stack>
  );
}

/** The CHIP row: capped, remainder REACHABLE — and it WRAPS. At a phone width four long-label chips overrun
 *  the available inline space and an ancestor clips the overflow, so the "+N more" disclosure (and later
 *  chips) were pushed off the right edge, unreachable with no scrollbar (side-eye 2026-08-24 P3). A second
 *  line is cheap above the composer, so the row wraps rather than clips — every capped chip and its
 *  disclosure stay on screen.
 *
 *  ── #2426: THE RESTING BAND IS ONE ROW AT A COARSE POINTER — THE WRAP RULING SURVIVES, ITS INPUT
 *  CHANGED ───────────────────────────────────────────────────────────────────────────────────────────
 *  The paragraph above is the 2026-08-24 P3 ruling and it is NOT reversed. What changed is the arm it was
 *  ruled for. Measured live 2026-09-19 at `device=coarse:dpr3:430x740` in a game room: this row wrapped to
 *  **115px** inside a **127px** band, against a **185px** transcript — the reading port was a quarter of
 *  the screen, four lines hard-clipped mid-glyph, and the wrap tax GREW with the chip count. The owner's
 *  ruling: on a coarse pointer the band collapses to a ONE-ROW SUMMARY STRIP that expands on tap, the
 *  composer stays, and the transcript gets a floor (`CHAT_READING_PORT_MIN_PX` below).
 *
 *  WHAT THE 2026-08-24 RULING ACTUALLY GUARANTEED is "every capped chip and its disclosure stay on screen,
 *  reachable, with no scrollbar" — and CLIPPING is what it forbade. That guarantee is intact here, by a
 *  stronger mechanism: at coarse-collapsed the chips are not clipped, they are STOOD DOWN
 *  (`HIDE_AT_COARSE`, `display:none` — out of layout and out of the a11y tree, not half-visible past an
 *  edge), and the one thing left in the row is the disclosure itself, which therefore can never be pushed
 *  anywhere. Expanding restores TODAY'S BAND VERBATIM: the same wrapping row, the same chips, the same
 *  accessible names. The row still carries `flex-wrap` for the expanded arm and for every fine pointer.
 *
 *  WHY `display:none` AND NOT `sr-only` for the stood-down chips: `sr-only` would keep them announced at
 *  no layout cost, but they are BUTTONS — a focusable control with no visible box is a worse affordance
 *  than a disclosed one. The strip's `aria-expanded` names the path to them instead.
 *
 *  WHY NOT A RENDER-TIME POINTER READ: `coarsePointerNow()` (`@orb/ui/lib`) is a point-in-time imperative
 *  read with no subscription — correct for a bug-report capture, wrong as a render input. The pointer arm
 *  is CSS, homed in `#components`' fragments because `pointer-coarse:` is gate-banned in features/**.
 *
 *  THE DISCLOSURE IS AN EXPANDER, NOT A COUNT (#684 P2). The cap is a per-ROW budget, but the chips crossing
 *  it belong to RULES: one rule that surfaces three openers and another that surfaces three vote options put
 *  six chips in the row, so the member saw one vote option and a dead `<p>` reading "+2 more" — the other two
 *  options were not hidden behind an affordance, they were GONE, with no pointer trick and no keyboard path
 *  to them. The alternative arm (budget the cap per SOURCE) does not answer it: the quick-reply source
 *  flattens every live rule's set into ONE source's publish (`quick-reply-chip-mount.tsx`), so a per-source
 *  budget is the row budget with extra steps. So the count becomes a real `<button>` with `aria-expanded`:
 *  focusable, keyboard-operable, and reversible. The cap still governs the RESTING row (law 5 — one row,
 *  never a wall); expansion is the member's own choice, and it is per-mount transient state, exactly like the
 *  chips it discloses. */
function ControlChips({ controls, consumer }: { readonly controls: readonly ChatControl[]; readonly consumer: ControlConsumer }): ReactElement | null {
  const [expanded, setExpanded] = useState(false);
  const chips = controls.filter((control) => control.kind === "chip");
  if (chips.length === 0) {
    return null;
  }
  const hidden = chips.length - CHIP_DISPLAY_CAP;
  const shown = expanded ? chips : chips.slice(0, CHIP_DISPLAY_CAP);
  // #2426 — AT A COARSE POINTER THE RESTING BAND IS ONE ROW: the chips stand down and the disclosure IS
  // the strip. A fine pointer is byte-identical to before (both fragments are inert there).
  const chipStandDown = expanded ? "" : HIDE_AT_COARSE;
  // The disclosure exists in BOTH pointer arms at coarse — a row UNDER the display cap discloses nothing
  // at a fine pointer but is the whole strip at a coarse one — so it renders unconditionally and stands
  // itself down at fine when the cap hides nothing, which is exactly what it has always meant there.
  const disclosureStandDown = hidden > 0 ? "" : SHOW_ONLY_AT_COARSE;
  return (
    <Row align="center" className="flex-wrap" data-slot="chat-control-chips" gap="field">
      {shown.map((chip) => (
        <ControlActionButton action={chip.action} as="chip" className={chipStandDown} consumer={consumer} key={chip.id} />
      ))}
      {/* No `data-slot` override on the disclosure: `@orb/ui` Button owns that attribute (tiers.css keys
          padding/height off `data-slot=button`, and the density-tier gate proves those rules are live). It is
          addressable as the row's one `aria-expanded` button, which is also how a member's AT finds it.

          TWO COLLAPSED LABELS, ONE PER POINTER, because the button reveals a DIFFERENT set in each arm: at
          fine it reveals the remainder past the display cap (`+N more`), at coarse it reveals the whole row
          (`Show N controls`). Spelled as two device-swapped spans rather than a render-time pointer read —
          `coarsePointerNow()` is a point-in-time imperative read with no subscription, not a render input —
          and `display: none` takes the inert one out of the a11y tree, so the accessible name is the one
          true sentence in each arm rather than both concatenated. */}
      <Button
        aria-expanded={expanded}
        className={disclosureStandDown}
        intent="ghost"
        onClick={(): void => setExpanded((open) => !open)}
        shape="pill"
        size="chip"
      >
        {expanded ? (
          CONTROL_CHIPS_COLLAPSE
        ) : (
          <>
            {hidden <= 0 ? null : (
              <Text as="span" className={HIDE_AT_COARSE} ink="inherit" voice="interactiveKicker">
                {controlOverflowNotice(hidden, "more")}
              </Text>
            )}
            <Text as="span" className={SHOW_ONLY_AT_COARSE} ink="inherit" voice="interactiveKicker">
              {controlStripNotice(chips.length)}
            </Text>
          </>
        )}
      </Button>
    </Row>
  );
}

/** The stack, exhaustive over the kind axis — declared order IS render order (cards above chips). */
const KIND_STACK: Record<ChatControlKind, (controls: readonly ChatControl[], consumer: ControlConsumer) => ReactNode> = {
  card: (controls, consumer) => <ControlCards consumer={consumer} controls={controls} />,
  chip: (controls, consumer) => <ControlChips consumer={consumer} controls={controls} />,
};

/** The band. It PAINTS a reading surface (`BAND_READING_SURFACE`, #674) — and that is exactly why the
 *  emptiness rule below is load-bearing rather than a micro-optimisation: a surface on an always-rendered
 *  wrapper would paint an empty strip above every room's composer.
 *
 *  Zero live controls ⇒ NO `chat-controls` element at all: the source mounts render null, so the
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
        <Stack className={BAND_READING_SURFACE} data-slot="chat-controls" gap="row">
          {CHAT_CONTROL_KINDS.map((kind) => (
            <Fragment key={kind}>{KIND_STACK[kind](controls, consumer)}</Fragment>
          ))}
        </Stack>
      )}
    </>
  );
}
