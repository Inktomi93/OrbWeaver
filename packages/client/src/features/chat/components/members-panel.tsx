// The MEMBERS panel (FINAL-Chat-Tab-Redesign §7.1 — the Roster+People merge): ONE list, two sections
// (People = humans · Cast = characters — both are "who's in the room"; FINAL-Chats §8.3 refuses a
// split tab). SOURCE-AGNOSTIC (dual-mode, the FINAL-Chats §1 corollary): the committed surface projects
// `ChatDetail.participants` (+ `pendingHostUserId`) and wires the membership/roster verbs; the draft
// twin projects the founding cards and wires the draft-config store (people empty, no membership verbs).
// The surface also mirrors the server gates — host-only callbacks are simply ABSENT for a member
// (§8.1: a member never sees an affordance that would only NOT_FOUND).
//
// The BINDING interaction contract (§7.1) implemented here:
//   • ONE roving tabindex over the whole list (one tab stop per panel): ArrowUp/ArrowDown cross the
//     People→Cast boundary, Home/End jump, typeahead-by-name cycles, Tab exits (every non-body control
//     in a row is tabIndex -1 — member-row-menu.tsx).
//   • The per-row `@orb/ui/menu` is the canonical action home (rendered by `MemberRow`).
//   • POST-DESTRUCTIVE focus: a kick removes its row on the BUS echo (the verb is busDriven), so the
//     row records a pending-focus intent here first; when the row disappears from the projected list,
//     focus lands on the next row (previous if it was last; the People section-header action if the
//     section emptied) — never `body`. Self-leave navigates (`goToLanding`), so the landing's own
//     mount-focus takes over (gate surface-a11y-focus).
//
// The list scrolls in an `@orb/ui/scroll-area` (long rosters); section headers are micro-caps `Text`,
// and the People header carries the host's "Invite people" action (→ the §8.2 mint dialog).

import { Button } from "@orb/ui/button";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve Icon/UserPlus fine (the roster-panel.tsx precedent).
import { Icon, UserPlus } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { ScrollArea } from "@orb/ui/scroll-area";
import { Text } from "@orb/ui/text";
import type { KeyboardEvent, ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { testId } from "#lib";
import type { MemberCastRow, MemberPersonRow, MemberRowActions } from "../lib/member-rows";
import { MemberRow } from "./member-row";

export interface MembersPanelProps extends MemberRowActions {
  /** The PRESENT human seats, projected — empty for a draft / single-user install. */
  readonly people: readonly MemberPersonRow[];
  /** The character seats, projected — the surface passes `[]` below the ≥2 disclosure gate (§12). */
  readonly cast: readonly MemberCastRow[];
  /** Host-only People-header action → the invite mint dialog (§8.2). Absent for a member. */
  readonly onInvitePeople?: (() => void) | undefined;
}

/** Typeahead buffer lifetime (ms) — keystrokes within this window concatenate into one name query. */
const TYPEAHEAD_RESET_MS = 700;

// Post-destructive focus re-assertion cadence: the kick's AlertDialog tears down AFTER the bus echo
// removed the row and tries to restore focus to the now-unmounted row trigger, dropping focus to
// `<body>` — observed live 2026-07-13. The dialog's exit animation + focus-restore land ~0.5–1s after
// the echo, so a fixed-interval sweep covers the whole teardown window; each pass re-focuses only if
// focus actually fell to `body`/nowhere, so a user who moved focus deliberately is never yanked.
const FOCUS_REASSERT_INTERVAL_MS = 200;
const FOCUS_REASSERT_PASSES = 7;

/** Focus `el` now AND re-assert across the confirm dialog's teardown window (see the constants). */
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

type MembersRow = MemberPersonRow | MemberCastRow;

/** The next row index for a navigation key, clamped to the list. `null` = not a navigation key. */
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

/** Typeahead-by-name: the first row (cycling from `start`) whose name starts with the buffer. */
function typeaheadTarget(
  rows: readonly MembersRow[],
  buffer: string,
  start: number,
): number | null {
  for (let step = 0; step < rows.length; step += 1) {
    const index = (start + step + rows.length) % rows.length;
    if (rows[index]?.displayName.toLowerCase().startsWith(buffer) === true) {
      return index;
    }
  }
  return null;
}

/** The Members tab body — People + Cast sections in ONE roving-tabindex list. */
export function MembersPanel(props: MembersPanelProps): ReactElement {
  const { people, cast, onInvitePeople } = props;
  const rows: readonly MembersRow[] = [...people, ...cast];

  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const inviteRef = useRef<HTMLButtonElement | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  // A kick's focus intent: recorded at confirm, resolved when the bus echo drops the row (header).
  const pendingFocusRef = useRef<{ key: string; index: number; wasPerson: boolean } | null>(null);
  const typeaheadRef = useRef<{ buffer: string; at: number }>({ buffer: "", at: 0 });

  // The one roving tab stop: the active row if it still exists, else the first row.
  const effectiveActiveKey = rows.some((r) => r.key === activeKey)
    ? activeKey
    : (rows[0]?.key ?? null);

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

  // CAPTURE-phase (load-bearing): the row body IS a Base UI MenuTrigger, whose own keydown handler
  // opens the menu on ArrowDown/ArrowUp. The roving navigation must claim those keys FIRST —
  // capture + stopPropagation — or every ArrowDown would pop a menu instead of moving focus
  // (Enter/Space still reach the trigger untouched: they aren't navigation keys here).
  const handleKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>): void => {
    const currentIndex = rows.findIndex((r) => r.key === effectiveActiveKey);
    const navTarget = navigationTarget(event.key, currentIndex, rows.length);
    if (navTarget !== null) {
      event.preventDefault();
      event.stopPropagation();
      focusRow(navTarget);
      return;
    }
    // Typeahead-by-name (printable single chars; the buffer resets after a quiet window).
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const prior = typeaheadRef.current;
      const buffer =
        event.timeStamp - prior.at <= TYPEAHEAD_RESET_MS
          ? prior.buffer + event.key.toLowerCase()
          : event.key.toLowerCase();
      typeaheadRef.current = { buffer, at: event.timeStamp };
      const start = buffer.length === 1 ? currentIndex + 1 : currentIndex;
      const target = typeaheadTarget(rows, buffer, start);
      if (target !== null) {
        event.preventDefault();
        event.stopPropagation();
        focusRow(target);
      }
    }
  };

  // Post-destructive focus (§7.1): when the kicked row's bus echo lands and the row is gone, move
  // focus to a neighbor (previous if it was last; the section-header action if People emptied). A
  // LOCAL-list effect (not a shared-selection subscription — gate no-effect-on-shared-selection);
  // deps are the PROPS (stable between data changes under the Compiler), never the per-render `rows`.
  useEffect(() => {
    const currentRows: readonly MembersRow[] = [...people, ...cast];
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
      setActiveKey(row.key);
    }
    if (el !== null) {
      focusWithReassert(el);
    }
  }, [people, cast]);

  const onRequestRemovalFocus = (key: string): void => {
    pendingFocusRef.current = {
      key,
      index: rows.findIndex((r) => r.key === key),
      wasPerson: people.some((p) => p.key === key),
    };
  };

  const rowProps = (row: MemberPersonRow | MemberCastRow): ReactElement => (
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
      leaveArchivesRoom={props.leaveArchivesRoom}
      onSetDisabled={props.onSetDisabled}
      onSetTalkativeness={props.onSetTalkativeness}
      onForceTurn={props.onForceTurn}
      onViewCharacter={props.onViewCharacter}
    />
  );

  const showPeople = people.length > 0 || onInvitePeople !== undefined;

  return (
    <Stack gap="row" className="h-full min-h-0" data-testid={testId("membersPanel")}>
      <ScrollArea className="min-h-0 flex-1">
        {/* The keydown listener implements the §7.1 roving-tabindex NAVIGATION over the row buttons
            (which own focus + activation); the wrapper itself is never interactive or focusable. */}
        <Stack gap="section" onKeyDownCapture={handleKeyDownCapture}>
          {showPeople ? (
            <Stack gap="row" data-slot="members-people">
              <Row gap="field" align="center" justify="between">
                <Text as="span" size="micro" tone="muted" transform="caps">
                  People
                </Text>
                {onInvitePeople === undefined ? null : (
                  <Button
                    type="button"
                    intent="ghost"
                    size="sm"
                    ref={inviteRef}
                    onClick={onInvitePeople}
                    data-testid={testId("invitePeopleButton")}
                  >
                    <Icon icon={UserPlus} size="sm" />
                    Invite people
                  </Button>
                )}
              </Row>
              {people.length === 0 ? (
                <Text tone="muted">No one else is here yet — share an invite.</Text>
              ) : (
                people.map(rowProps)
              )}
            </Stack>
          ) : null}

          {cast.length > 0 ? (
            <Stack gap="row" data-slot="members-cast">
              <Text as="span" size="micro" tone="muted" transform="caps">
                Cast
              </Text>
              {cast.map(rowProps)}
            </Stack>
          ) : null}
        </Stack>
      </ScrollArea>
    </Stack>
  );
}
