// The new-chat character picker: the modal body every "new chat" affordance opens first, so a characterless
// chat survives only as an explicit "Blank chat" pick. The searchable character list is the shared
// `CharacterPicker` composite (cmdk-based — not createCollectionSurface, it's not virtualized and cmdk owns
// search/filtering/keyboard nav for free). Multi-select keeps the palette open on select and toggles a
// trailing check per row.
//
// THE START/BLANK ACTIONS LIVE IN A PERSISTENT FOOTER, NOT INSIDE THE SCROLLING LIST (#334). They used to
// be a `CommandGroup` handed to the picker's `leadingGroup` — which cmdk renders INSIDE the `CommandList`,
// so once the user scrolled down the character list to pick someone, the (now-enabled) "Start" affordance
// had scrolled off the top and there was nowhere left to click to begin. The actions are now real
// `<Button>`s in a footer BELOW the picker: the character list scrolls INSIDE the picker's own max-height
// region, so the footer never moves, and `sticky bottom-0` pins it in view even when the modal body itself
// scrolls on a short viewport. The "Start" button stays rendered but DISABLED at zero selection (teaching
// "Pick a character to start"), so the affordance is discoverable before it is usable.
//
// THE START CLICK MINTS THE ROOM (D166, fork F1(a)). It used to write
// client state and hand a "draft" — a rowless room backed by a whole parallel client runtime — to the chat
// surface. It now awaits the REAL `chat.startChat` (`useStartChat`, `#data`) and lands in the REAL room,
// committed from frame one. Two properties of that are deliberate and load-bearing:
//   · BACK STILL MINTS NOTHING. D123's interception principle is preserved exactly — dismissing this modal
//     costs zero rows. The row is minted by the explicit Start click, which IS the first real edit: a
//     deliberate creation act naming its characters.
//   · A ROOM STARTED AND ABANDONED IS A HUSK, not litter. It is hidden from the chats list by a server lens,
//     claimed by its first real activity, and reaped on nav-away + a TTL belt. The picker knows none of that.
//
// The modal stays OPEN for the one round-trip, with the confirm item reading its pending state, and closes
// only on success — a failed create leaves the user's characters picked and the mutation's own toast explaining
// why, instead of dismissing them into a landing screen with nothing to retry.
//
// THE CARET STARTS IN THE SEARCH BOX (#440, side-eye 2026-08-22). This surface used to run
// `useFocusOnMount` on its own `<Stack tabIndex={-1} className="outline-none">` — a wrapper that is neither
// the search field nor inside cmdk's key handler, so every keystroke a keyboard user made on arrival was
// SWALLOWED, with no focus ring on screen to explain why (measured: `activeElement = DIV.relative`,
// `cmdk-input.value === ""` after typing). The picker now passes `autoFocusSearch` to `CharacterPicker`,
// whose own `useFocusOnSwap` lands the caret when the ROWS mount — the case Base UI's dialog initial-focus
// cannot serve, because at open time this body is still the suspense fallback with nothing tabbable in it.
// The "the two would fight over the caret" note on that prop is retired by the same move: nothing here
// claims focus any more.
// The `surface-a11y-focus` waiver that records this decision is on `NewChatPicker` itself below, because a
// waiver POSITION is a source coordinate under the central engine and binds only to its own declaration's
// leading trivia — a marker up here would bind to nothing.
//
// THE ACTION FOOTER ADAPTS TO ITS OWN BOX, NOT THE VIEWPORT (#439). At the mobile mount (a 366px dialog)
// the two buttons at desktop label widths are wider than the footer's content box, and a `justify-end`
// overflow goes LEFT — so "Blank chat" painted OUTSIDE the dialog and was clipped by the popup, worse as
// the Start label grew with the selection count (measured 27px at 1 pick, 35px at 3). Below the `@md`
// container step the two buttons SHARE the row (`flex-1 min-w-0`) and Start wears a count-abbreviated
// label; at or above it they return to their natural widths and the full sentence. The step is a CONTAINER
// query, never a media query (the §0 container rule): this surface is a modal body whose width is the
// dialog's, not the viewport's. `@md` = 28rem = 448px, chosen with margin over the ~390px where the full
// labels stop fitting.
//
// THE ZERO-SELECTION START IS QUIET (#441). It used to be the loudest thing in the modal — a full primary
// orange fill that does nothing, with its teaching label composited at 2.64:1 by the primitive's
// `disabled:opacity-50`. The teaching arm is a low-emphasis `outline` control at FULL opacity instead: the
// quiet skin is what says "not yet", so the dim (whose only job was to say the same thing) is exactly what
// made the sentence unreadable. The primary fill is reserved for the state where the button can act.

import type { CharacterId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Icon, MessagesSquare, Plus, Users } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { CharacterPicker } from "#components";
import { useStartChat, useTRPC } from "#data";
import { clearNewChatIntent, closeModal, openModal, useNewChatIntent } from "#state";

const SKELETON_ROW_COUNT = 6;

/** The action buttons SHARE the footer row below the `@md` container step and take their natural widths at
 *  or above it (#439). Whole literals, never spliced — the Tailwind scanner never assembles a class name. */
const ACTION_BUTTON = "min-w-0 flex-1 @md:flex-none";

/** …and the teaching arm adds the opacity override. BOTH spellings are needed: Base UI's Button sets the
 *  native `disabled` attribute AND `data-disabled`, and the primitive dims on each. The dim is a SIGNAL of
 *  "not yet" that this arm delivers with its quiet `outline` intent instead — keeping it would leave the
 *  sentence that explains the state as the least legible text on the surface, at 2.64:1 (#441).
 *
 *  A RECORDED SITE-LEVEL EXEMPTION, adjudicated at #449 — this is a feature overriding a sealed primitive
 *  state, which is normally the review flag, and it stays here on three receipts:
 *    · It is the SANCTIONED channel, not an escape from one. `ui-package-design.md` §15 (owner-ratified):
 *      `className` is narrowed to `string` on every seal precisely so tailwind-merge can resolve it, and
 *      "a caller who genuinely needs state-driven classes uses data attributes" — which is exactly these
 *      two. Unlike the `size` axis (the `media`/`wrap`/`inline`/`glyph-*` arms in the Button variants, all
 *      minted because a custom-token utility was OPAQUE to tailwind-merge and resolved by stylesheet order
 *      or an `!important`), `opacity-*` is a stock utility in the merger's own group, so the seal's
 *      `data-disabled:opacity-50` and this arm's `data-disabled:opacity-100` collide inside one
 *      tailwind-merge group and resolve LAST-WINS deterministically. There is nothing here a variant
 *      would make expressible that a class does not already say.
 *    · ONE consumer. Surveyed at #449 across `packages/client/src` + `packages/ui/src`: this is the only
 *      override of the disabled dim in the tree (66 files mount a disabled `<Button>`; every other one is a
 *      submit-until-valid control with a short label, where the dim is correct and legibility is not the
 *      point). `UI-Primitives-and-Reuse.md` §13.9's litmus wants a committed consumer before API lands in
 *      the sealed package — the CapabilityGrantList precedent is "compose at feature level when one appears".
 *    · It has an ENFORCER, so the exemption is not prose. The `#441` case in
 *      `tests/client/features/chat/surfaces/new-chat-picker-surface.ct.tsx` polls the COMPUTED opacity of
 *      the disabled Start to `"1"` (computed, because `snap --contrast` ignores an element's own opacity and
 *      reported a false 7.56:1 pass on the dimmed original).
 *  GRADUATION CONDITION: the SECOND consumer mints the variant. A second surface wanting a legible-disabled
 *  teaching control turns this into a skin decided in two features — the drift the seal exists to stop — and
 *  the fix then is a Button variant (a `quietDisabled` arm on the state axis, beside `selection`), with both
 *  sites repointed and this constant deleted. Do not mint it for one site. */
const TEACHING_ACTION_BUTTON = "min-w-0 flex-1 @md:flex-none disabled:opacity-100 data-disabled:opacity-100";

/** The Start button's full label — also its accessible name at `@md` and up. */
function startLabelFor(count: number, pending: boolean): string {
  if (pending) {
    return "Starting…";
  }
  return count === 0 ? "Pick a character to start" : `Start chat with ${count} character${count === 1 ? "" : "s"}`;
}

/** The narrow-container label. Short enough that the two buttons share a 366px dialog without either
 *  leaving it, and count-shaped so the width stops breathing on every toggle. */
function compactStartLabelFor(count: number, pending: boolean): string {
  if (pending) {
    return "Starting…";
  }
  return count === 0 ? "Pick a character" : `Start (${count})`;
}

/** The polite announcement of the count (side-eye ARIA rec #2): the Start button's accessible name carries
 *  it, but a user whose focus is in the search box never hears that name change, so toggling a character
 *  was silent. Always mounted, so the region exists before it has something to say. */
function selectionStatusFor(count: number): string {
  return count === 0 ? "No characters selected" : `${count} character${count === 1 ? "" : "s"} selected`;
}

// @orb-waive surface-a11y-focus(NewChatPicker): the picker BODY owns arrival focus — `CharacterPicker`'s own `autoFocusSearch` lands the caret in the search combobox when the rows mount, and a `useFocusOnMount` here is exactly the defect #440 fixed (it parked focus on a dead wrapper and swallowed every keystroke). Ends when this surface stops delegating to `CharacterPicker`, or when that prop stops taking focus.
export function NewChatPicker(): ReactElement {
  const [selected, setSelected] = useState<ReadonlySet<CharacterId>>(() => new Set<CharacterId>());
  // The creation parameters this open was PRE-ARMED with (the home temp-chat tile's `temporary: true`).
  // Cleared by a real modal dismiss — never component cleanup, which React Strict Mode probes while this
  // modal remains logically open. Every opener also overwrites it before opening.
  const intent = useNewChatIntent();
  const { startChat, isPending } = useStartChat();
  const trpc = useTRPC();
  // #26 — the "Start from a saved roster" door, shown only when the library HAS saved rosters (the program
  // doc's empty-library rule: the AFFORDANCE hides; the modal itself keeps its designed empty state).
  // Cache-first at staleTime:Infinity, bus-driven fresh via `rosterPresetsChanged`.
  const { data: rosters } = useQuery(trpc.rosterPreset.list.queryOptions());
  const hasRosters = (rosters?.length ?? 0) > 0;

  const dismiss = (): void => {
    clearNewChatIntent();
    closeModal();
  };

  const toggle = (id: CharacterId): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const found = (characterIds: readonly CharacterId[]): void => {
    if (isPending) {
      return; // one creation at a time — a double-fire would mint two rooms for one intent.
    }
    // `startChat` navigates into the new room itself (it owns the cache seed + the enter action). A failure
    // is already toasted by the mutation; we simply do not close, so the picked characters survive for a retry.
    // @orb-waive caught-failure-ownership(startChat): useStartChat's mutation carries
    // errorToast: "Couldn't start the chat." — the toast is the surface; not closing lets the picked characters survive
    // a retry. Ends if useStartChat drops errorToast.
    startChat({ ...intent, ...(characterIds.length > 0 ? { characterIds } : {}) })
      .then(closeModal)
      .catch(() => undefined);
  };

  const selectedCount = selected.size;
  // Hoisted out of JSX: a ternary between two STRING variables in a JSX child is `noLeakedRender`-shaped.
  const startLabel = startLabelFor(selectedCount, isPending);
  const compactStartLabel = compactStartLabelFor(selectedCount, isPending);
  // The teaching arm — rendered, disabled, and QUIET, so the affordance is discoverable before it is usable
  // without spending the modal's one focal control on a button that cannot act (#441).
  const teaching = selectedCount === 0;

  return (
    <Stack className="@container">
      {/* The temporary flag is a CREATION-ONLY parameter the user can't change later, so the picker states
          it up front rather than surprising them in the room (temp tile → this modal → a room born
          Temporary). */}
      {intent?.temporary === true ? (
        <Row align="center" gap="field" padding="block">
          <Badge intent="neutral" tone="soft">
            Temporary
          </Badge>
          <Text size="label" tone="muted">
            This room won't join your chats list, and you can't switch it later.
          </Text>
        </Row>
      ) : null}
      {hasRosters ? (
        <Row justify="end" padding="block">
          {/* #26 — hop to the saved-roster picker (the slot is the destination — no feature import). The
              intent is cleared like any dismiss: a roster start carries its own creation parameters. */}
          <Button
            intent="ghost"
            size="sm"
            onClick={(): void => {
              clearNewChatIntent();
              closeModal();
              openModal("savedRosters");
            }}
          >
            <Icon icon={Users} size="sm" />
            Start from a saved roster
          </Button>
        </Row>
      ) : null}
      <CharacterPicker
        autoFocusSearch={true}
        emptyText="No characters match."
        isSelected={(id): boolean => selected.has(id)}
        label="Choose characters"
        listClassName="max-h-96"
        onEscape={dismiss}
        onSelect={toggle}
        placeholder="Search characters…"
        reserveKey="chat.newChatPicker"
        rowsHeading="Characters"
        skeletonCount={SKELETON_ROW_COUNT}
      />
      {/* PERSISTENT ACTION FOOTER (#334). Below the picker's own scrolling list, so a pick made deep in the
          list still has the Start action in view. `sticky bottom-0` keeps it pinned when the modal body
          scrolls; `bg-popover` matches the modal surface so scrolled rows don't bleed through. */}
      <Row align="center" className="sticky bottom-0 border-border border-t bg-popover" gap="field" justify="end" padding="block">
        <Text as="span" className="sr-only" role="status">
          {selectionStatusFor(selectedCount)}
        </Text>
        <Button className={ACTION_BUTTON} disabled={isPending} intent="ghost" onClick={(): void => found([])}>
          <Icon icon={Plus} size="sm" />
          Blank chat
        </Button>
        <Button
          className={teaching ? TEACHING_ACTION_BUTTON : ACTION_BUTTON}
          disabled={teaching || isPending}
          intent={teaching ? "outline" : "primary"}
          onClick={(): void => found([...selected])}
        >
          <Icon icon={MessagesSquare} size="sm" />
          {/* Both arms are always in the DOM and the container query shows ONE (the message-row pattern) —
              a `display: none` arm is out of the a11y tree too, so the accessible name is always the arm
              on screen. */}
          <Row className="@md:hidden">{compactStartLabel}</Row>
          <Row className="hidden @md:flex">{startLabel}</Row>
        </Button>
      </Row>
    </Stack>
  );
}
