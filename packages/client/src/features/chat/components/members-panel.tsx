// The Members panel: one list, two sections (People = humans, Characters = the seated characters). Source-agnostic —
// the committed surface projects ChatDetail.participants and wires the membership/roster verbs; the
// draft twin projects the founding cards and wires the draft-config store. One roving tabindex over the
// whole list; a kick removes its row on the bus echo, so focus is recorded pending and re-asserted onto
// a neighbor once the row disappears from the projected list.
//
// ── THE COMPOSITE IS ANNOUNCED (#208, 2026-08-18) ───────────────────────────────────────────────────
// The roving tabindex above is the RIGHT mechanism and it was INVISIBLE. MEASURED live on 2026-08-18,
// Tab-walking the open context panel from the Members tab: tabpanel → "Invite people" → the first PERSON
// row → "Add a character" → out of the panel. The CHARACTER rows are never reached by Tab; ArrowDown does reach
// them, but the list carried no container role at all, so nothing — not AT, not a sighted keyboard user —
// was ever told that arrows do anything here. A roving tabindex outside a composite widget is a keyboard
// model with no way to learn it.
//   · the LIST is `role="toolbar"` + `aria-orientation="vertical"` + its own name. Toolbar is the app's own
//     precedent for exactly this shape (rpg-hud-rail.tsx #112: a roving-focus set of controls that must NOT
//     claim a selection), and its contract IS this widget's: arrows inside, one stop for the rows.
//     DELIBERATE DEVIATION from the pattern's "a toolbar SHOULD be a single tab stop": the two section-
//     header doors (Invite people · Add a character) keep their OWN tab stops. They are the roster's primary
//     verbs, not row-level shortcuts, they already had those stops, and burying a create action behind an
//     arrow sweep of every member would be a worse affordance than the convention buys. The ROWS are the
//     single roving stop the convention is actually about.
//   · each section is a `role="group"` named BY ITS OWN VISIBLE KICKER (`aria-labelledby`, never a second
//     copy of the word) — so "People" and "Characters" reach AT as groups instead of as decoration.
//   · ArrowLeft/Right reach the row's TRAILING controls — the ⋯ menu shortcut, the fine-pointer inline
//     mute/force-turn, the talkativeness chip. Those are `tabIndex={-1}` siblings by §7.1 ruling (one tab
//     stop per row) and, until now, had no arrow handler either: they were reachable by POINTER ONLY. The
//     row's canonical Menu still carries every one of those verbs, so this is a shortcut, not the only
//     door — but a toolbar whose controls answer only to a mouse is not a toolbar.
// What did NOT change, deliberately: the roving index is still ONE index over People+Characters, so ArrowUp/Down
// still cross the section boundary (§7.1), and the post-kick focus restore still lands on whatever row took
// the removed index — including a character row.
//
// ── THE SECTION-HEADER WIDTH BUDGET (#912, owner-ruled 2026-08-30) ──────────────────────────────────
// PRICE A WORD HERE BEFORE YOU WRITE IT. A section header is a kicker plus that section's door(s), and
// until #912 it was ONE UNBREAKABLE LINE — so the pane's narrowest width, not the meaning of a control,
// decided how long a label was allowed to be. That is backwards, and it was paid for once already: #902
// C1's ruled rename grew the Characters kicker from "Cast" to "Characters" and the lane bought the
// deficit back by SHORTENING a neighbour's door to "Rosters…". MEASURED here afterwards, that trade did
// not even work — the deficit was the KICKER's (29.2px → 75.7px, +46.5) and the whole word "Saved " it
// removed was worth only 36.8px, so the cluster still escaped a 320px pane by 9.75px and this panel's own
// overflow pin sat RED on main. `SectionHeader` below WRAPS instead, and the doors keep their full
// spellings at every width the pane can be.
//
// The budget, MEASURED at the default theme in the CT browser (both pointer classes give the SAME widths
// here — the two doors are text buttons already past the coarse touch floor, so coarse costs HEIGHT, not
// width; the pins are `committed-members-tab.ct.tsx`). Re-measured 2026-09-02 after `ed55bf193` vendored
// Geist, with the pre-Geist fallback reading beside each number:
//   · "Characters" kicker 79.4 (was 75.7 — a 10.5px uppercase label carries a trailing letter-spacing
//     column, so it moves with the face) · gap-field 6 · "Saved rosters…" 137.0 (138.9) · gap-tight 4 ·
//     "Add a character" 142.0 (142.0)
//   · ONE LINE needs ≥ 368.5px of content box (was 366.6) · TWO LINES (kicker / both doors) ≥ 283.0
//     (was 284.9) · below that the two doors stack, and NOTHING overflows until the content box is
//     narrower than the widest single door (142.0) — which no real pane is: the narrowest is ~256
//     (`--dimension-panel-context`'s 17rem clamp floor less the bracket's `px-row`), and the phone sheet
//     is 100dvw − that padding (~304).
// So a new word costs a line at a narrower width, never a truncation and never a neighbour's label. If a
// change would push a single door past ~256px, THAT is the point to come back and re-decide.
//
// THE CLIFFS ARE PINNED BY MEASUREMENT, NOT BY WIDTH (#1044). These two thresholds moved ~2px when the
// face changed and no product code did; the CT used to assert a line count at 368, 1.4px above the then
// one-line cliff, and it red on unmodified main twice. It now SWEEPS for both cliffs and asserts them as
// inequalities against the pane's ends — so the numbers above are documentation, and the pane-relative
// law (one line at the ceiling, doors sharing a line at the phone sheet, no door wider than the floor)
// is the thing enforced.

import { Button } from "@orb/ui/button";
import { Icon, UserPlus } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { ScrollArea } from "@orb/ui/scroll-area";
import { Text } from "@orb/ui/text";
import type { KeyboardEvent, ReactElement, RefObject } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { testId } from "#lib";
import type { MemberCharacterRow, MemberPersonRow, MemberRowActions } from "../lib/member-rows.ts";
import { MemberRow } from "./member-row.tsx";

export interface MembersPanelProps extends MemberRowActions {
  readonly people: readonly MemberPersonRow[];
  readonly characters: readonly MemberCharacterRow[];
  readonly onInvitePeople?: (() => void) | undefined;
  /** The Invite people button, for a caller whose invite dialog can open without it (a request from another
   *  section) and must still return focus to it. The panel keeps its own ref when this is absent. */
  readonly inviteTriggerRef?: RefObject<HTMLButtonElement | null> | undefined;
  /** The CHARACTERS section header's add door — the character half of the roster's one add/invite affordance
   *  (#162: the tab offered a way to invite humans and no way to add a character, though "add more characters
   *  or add people into it" is one feature). A rendered SLOT rather than a callback because the committed
   *  surface's door is an anchored Popover picker (`AddMemberPopover`) that must own its own trigger; the
   *  panel stays source-agnostic and simply gives it the header seat. Absent ⇒ a non-host view, where the
   *  section is a read-only list exactly as before. */
  readonly charactersAction?: ReactElement | undefined;
}

const TYPEAHEAD_RESET_MS = 700;

// The kick's confirm dialog tears down after the bus echo removes the row and tries to restore focus
// to the now-unmounted trigger, dropping focus to <body>. A fixed-interval sweep covers the whole
// teardown window, re-focusing only if focus actually fell to body/nowhere.
const FOCUS_REASSERT_INTERVAL_MS = 200;
const FOCUS_REASSERT_PASSES = 7;

function focusWithReassert(el: HTMLElement): void {
  el.focus();
  const reassert = (): void => {
    const active = globalThis.document.activeElement;
    if ((active === null || active === globalThis.document.body) && el.isConnected) {
      el.focus();
    }
  };
  for (let pass = 1; pass <= FOCUS_REASSERT_PASSES; pass += 1) {
    globalThis.setTimeout(reassert, pass * FOCUS_REASSERT_INTERVAL_MS);
  }
}

type MembersRow = MemberPersonRow | MemberCharacterRow;

/** The horizontal step, or 0 for any other key. (A `Record` keyed by the DOM key names would be the §5.5
 *  idiom, but `ArrowRight`/`ArrowLeft` are PascalCase literals the naming-convention rule rejects as object
 *  keys — the same shape `navigationTarget` above already spells as a switch.) */
function horizontalStep(key: string): number {
  if (key === "ArrowRight") {
    return 1;
  }
  return key === "ArrowLeft" ? -1 : 0;
}

/** THE ROW'S OWN CONTROLS, in DOM order: the body (the Menu trigger, the one tab stop) then every
 *  `tabIndex={-1}` sibling — the fine-pointer inline mute/force-turn, the talkativeness chip, the ⋯. This is
 *  what ArrowLeft/Right walks (#208). Read off the DOM rather than modelled in state because the set is
 *  row-KIND- and pointer-dependent (a person row has no inline cluster; the cluster is absent entirely at a
 *  coarse pointer), and the DOM is the one place that is always already correct about which exist. */
function rowControls(from: Element | null): readonly HTMLElement[] {
  const row = from?.closest('[data-slot="member-row"]') ?? null;
  return row === null ? [] : [...row.querySelectorAll<HTMLElement>("button")];
}

/** ArrowRight/ArrowLeft within ONE row — clamped at both ends (never wrapping into a neighbour row, which
 *  is what ArrowUp/Down is for). Returns false when the key is not a horizontal move or there is nowhere to
 *  go, so the caller leaves the event alone. */
function moveWithinRow(key: string, active: Element | null): boolean {
  const step = horizontalStep(key);
  if (step === 0) {
    return false;
  }
  const controls = rowControls(active);
  const index = controls.findIndex((el) => el === active);
  const next = controls[index + step];
  if (index < 0 || next === undefined) {
    return false;
  }
  next.focus();
  return true;
}

/** The accumulating type-to-jump buffer, resolved to a row index — or `null` when the key is not a
 *  printable character or nothing matches. Split out of the keydown handler so that handler stays inside
 *  the `noExcessiveCognitiveComplexity` ceiling once the horizontal arm joined it (#208). */
function typeaheadNext(
  event: KeyboardEvent<HTMLDivElement>,
  state: { current: { buffer: string; at: number } },
  rows: readonly MembersRow[],
  currentIndex: number,
): number | null {
  if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) {
    return null;
  }
  const prior = state.current;
  const buffer = event.timeStamp - prior.at <= TYPEAHEAD_RESET_MS ? prior.buffer + event.key.toLowerCase() : event.key.toLowerCase();
  state.current = { buffer, at: event.timeStamp };
  return typeaheadTarget(rows, buffer, buffer.length === 1 ? currentIndex + 1 : currentIndex);
}

function navigationTarget(key: string, currentIndex: number, rowCount: number): number | null {
  switch (key) {
    case "ArrowDown":
      return Math.min(currentIndex + 1, rowCount - 1);
    case "ArrowUp":
      return Math.max(currentIndex - 1, 0);
    case "Home":
      return 0;
    case "End":
      return rowCount - 1;
    default:
      return null;
  }
}

function typeaheadTarget(rows: readonly MembersRow[], buffer: string, start: number): number | null {
  for (let step = 0; step < rows.length; step += 1) {
    const index = (start + step + rows.length) % rows.length;
    if (rows[index]?.displayName.toLowerCase().startsWith(buffer) === true) {
      return index;
    }
  }
  return null;
}

/** ONE section header: the kicker LEADS, the section's door(s) TRAIL, and the line WRAPS when the two
 *  cannot share it (#912 — the width budget is in this file's header). Both sections render through this
 *  one function so a word-length change is priced once, not per section.
 *
 *  `ms-auto` on the action cell, NOT `justify="between"` on the Row: `justify-content` resolves PER FLEX
 *  LINE, so once the row wraps, the door cluster is the only item on its line and `between` lands it at
 *  flex-START — the doors would change edge partway down the width range (measured: trailing at 368,
 *  leading at 320, trailing again at 256 once the cluster wrapped internally). An auto inline-start margin
 *  trails them on a shared line AND on their own, at every width.
 *
 *  The action is WRAPPED rather than given the margin directly because the characters door is a consumer-owned
 *  SLOT (`charactersAction`) — a panel invariant that depended on the slot remembering a class would be a
 *  prose-only boundary, which is not a placement. */
function SectionHeader({
  labelId,
  kicker,
  action,
}: {
  readonly labelId: string;
  readonly kicker: string;
  readonly action?: ReactElement | undefined;
}): ReactElement {
  return (
    // `data-slot`: the header's LINE COUNT and its doors' trailing edge are the properties the budget above
    // is about, so they need a handle a CT can measure (committed-members-tab.ct.tsx, the matrix-end pins).
    <Row gap="field" align="center" className="flex-wrap" data-slot="members-section-header">
      <Text as="span" voice="kicker" id={labelId}>
        {kicker}
      </Text>
      {action === undefined ? null : (
        <Row align="center" className="ms-auto" data-slot="members-section-doors">
          {action}
        </Row>
      )}
    </Row>
  );
}

export function MembersPanel(props: MembersPanelProps): ReactElement {
  const { people, characters, onInvitePeople, inviteTriggerRef } = props;
  const rows: readonly MembersRow[] = [...people, ...characters];

  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const inviteRef = useRef<HTMLButtonElement | null>(null);
  // The button fills both the panel's own ref and the caller's, when it gave one.
  const inviteTarget = (node: HTMLButtonElement | null): void => {
    inviteRef.current = node;
    if (inviteTriggerRef !== undefined) {
      inviteTriggerRef.current = node;
    }
  };
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const pendingFocusRef = useRef<{ key: string; index: number; wasPerson: boolean } | null>(null);
  const typeaheadRef = useRef<{ buffer: string; at: number }>({ buffer: "", at: 0 });
  // Each section's GROUP name is its own on-screen kicker (#208) — one string, so the announced name and
  // the printed word cannot drift.
  const peopleLabelId = useId();
  const charactersLabelId = useId();

  const effectiveActiveKey = rows.some((r) => r.key === activeKey) ? activeKey : (rows[0]?.key ?? null);

  const registerRef = (key: string, el: HTMLButtonElement | null): void => {
    if (el === null) {
      rowRefs.current.delete(key);
    } else {
      rowRefs.current.set(key, el);
    }
  };

  const focusRow = (index: number): void => {
    const row = rows[Math.min(Math.max(index, 0), rows.length - 1)];
    if (row !== undefined) {
      setActiveKey(row.key);
      rowRefs.current.get(row.key)?.focus();
    }
  };

  // Capture-phase: the row body is a MenuTrigger whose own keydown opens the menu on ArrowDown/ArrowUp;
  // roving navigation must claim those keys first via capture + stopPropagation.
  const handleKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>): void => {
    // ArrowLeft/Right FIRST (#208): it is the only claimant of those keys here, and answering it before the
    // vertical/typeahead arms keeps each key's owner obvious. Capture-phase for the same reason the vertical
    // arm is — the row body is a MenuTrigger with its own key handling.
    if (moveWithinRow(event.key, globalThis.document.activeElement)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const currentIndex = rows.findIndex((r) => r.key === effectiveActiveKey);
    const navTarget = navigationTarget(event.key, currentIndex, rows.length);
    if (navTarget !== null) {
      event.preventDefault();
      event.stopPropagation();
      focusRow(navTarget);
      return;
    }
    const typed = typeaheadNext(event, typeaheadRef, rows, currentIndex);
    if (typed !== null) {
      event.preventDefault();
      event.stopPropagation();
      focusRow(typed);
    }
  };

  useEffect(() => {
    const currentRows: readonly MembersRow[] = [...people, ...characters];
    const pending = pendingFocusRef.current;
    if (pending === null || currentRows.some((r) => r.key === pending.key)) {
      return;
    }
    pendingFocusRef.current = null;
    if (pending.wasPerson && people.length === 0 && inviteRef.current !== null) {
      focusWithReassert(inviteRef.current);
      return;
    }
    const row = currentRows[Math.min(pending.index, currentRows.length - 1)];
    const el = row === undefined ? inviteRef.current : (rowRefs.current.get(row.key) ?? null);
    if (row !== undefined) {
      // eslint-disable-next-line react-you-might-not-need-an-effect/no-derived-state -- not derivable in render: this runs only once the removed row is CONFIRMED gone from the roster props (the bus echo), moving the roving-tabindex key to whatever took its place alongside the imperative focus restore.
      setActiveKey(row.key);
    }
    if (el !== null) {
      focusWithReassert(el);
    }
  }, [people, characters]);

  const onRequestRemovalFocus = (key: string): void => {
    pendingFocusRef.current = {
      key,
      index: rows.findIndex((r) => r.key === key),
      wasPerson: people.some((p) => p.key === key),
    };
  };

  const rowProps = (row: MemberPersonRow | MemberCharacterRow): ReactElement => (
    <MemberRow
      key={row.key}
      row={row}
      tabIndex={row.key === effectiveActiveKey ? 0 : -1}
      registerRef={registerRef}
      onRowFocus={setActiveKey}
      onRequestRemovalFocus={onRequestRemovalFocus}
      onKick={props.onKick}
      onNominateHost={props.onNominateHost}
      onLeave={props.onLeave}
      onSetHistoryVisibility={props.onSetHistoryVisibility}
      leaveArchivesRoom={props.leaveArchivesRoom}
      onSetDisabled={props.onSetDisabled}
      onSetTalkativeness={props.onSetTalkativeness}
      onForceTurn={props.onForceTurn}
      onRemoveCharacter={props.onRemoveCharacter}
      onViewCharacter={props.onViewCharacter}
    />
  );

  const showPeople = people.length > 0 || onInvitePeople !== undefined;
  // The Characters section renders whenever the room HAS characters, or whenever this viewer can give it one — the
  // People section's own rule, so the add door can never be the thing its own empty state hides.
  const showCharacters = characters.length > 0 || props.charactersAction !== undefined;

  return (
    <Stack gap="row" className="h-full min-h-0" data-testid={testId("membersPanel")}>
      {/* contentClassName caps the content at the viewport width (overriding the ScrollArea's default
          `min-w-max`, which measures past the viewport for horizontal overflow): a members list scrolls
          vertically only, so a long member name TRUNCATES cleanly instead of busting the panel width. */}
      <ScrollArea className="min-h-0 flex-1" contentClassName="w-full !min-w-0">
        {/* THE ANNOUNCED COMPOSITE (#208 — see the header). `toolbar` + a vertical orientation is what the
            roving tabindex below has always BEHAVED as; until today it said nothing, so the arrow keys that
            are the only route to the Character rows were undiscoverable by AT and by sighted keyboard users
            alike. The name is the one word the tab that owns this pane does not already say. */}
        <Stack gap="section" role="toolbar" aria-orientation="vertical" aria-label="Members and characters" onKeyDownCapture={handleKeyDownCapture}>
          {showPeople ? (
            // The section is a GROUP named by its OWN visible kicker (`aria-labelledby`, never a second
            // copy of the word) — "People" and "Characters" are the list's structure, not decoration.
            <Stack gap="row" data-slot="members-people" role="group" aria-labelledby={peopleLabelId}>
              <SectionHeader
                labelId={peopleLabelId}
                kicker="People"
                action={
                  onInvitePeople === undefined ? undefined : (
                    <Button type="button" intent="ghost" size="sm" ref={inviteTarget} onClick={onInvitePeople} data-testid={testId("invitePeopleButton")}>
                      <Icon icon={UserPlus} size="sm" />
                      Invite people
                    </Button>
                  )
                }
              />
              {people.length === 0 ? <Text>No one else is here yet — share an invite.</Text> : people.map(rowProps)}
            </Stack>
          ) : null}

          {showCharacters ? (
            <Stack gap="row" data-slot="members-characters" role="group" aria-labelledby={charactersLabelId}>
              <SectionHeader labelId={charactersLabelId} kicker="Characters" action={props.charactersAction} />
              {characters.length === 0 ? <Text>No characters in this chat yet — add one.</Text> : characters.map(rowProps)}
            </Stack>
          ) : null}
        </Stack>
      </ScrollArea>
    </Stack>
  );
}
