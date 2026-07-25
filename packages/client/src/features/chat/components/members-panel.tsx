// The Members panel: one list, two sections (People = humans, Cast = characters). Source-agnostic —
// the committed surface projects ChatDetail.participants and wires the membership/roster verbs; the
// draft twin projects the founding cards and wires the draft-config store. One roving tabindex over the
// whole list; a kick removes its row on the bus echo, so focus is recorded pending and re-asserted onto
// a neighbor once the row disappears from the projected list.

import { Button } from "@orb/ui/button";
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
  readonly people: readonly MemberPersonRow[];
  readonly cast: readonly MemberCastRow[];
  readonly onInvitePeople?: (() => void) | undefined;
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

type MembersRow = MemberPersonRow | MemberCastRow;

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

export function MembersPanel(props: MembersPanelProps): ReactElement {
  const { people, cast, onInvitePeople } = props;
  const rows: readonly MembersRow[] = [...people, ...cast];

  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const inviteRef = useRef<HTMLButtonElement | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const pendingFocusRef = useRef<{ key: string; index: number; wasPerson: boolean } | null>(null);
  const typeaheadRef = useRef<{ buffer: string; at: number }>({ buffer: "", at: 0 });

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
    const currentIndex = rows.findIndex((r) => r.key === effectiveActiveKey);
    const navTarget = navigationTarget(event.key, currentIndex, rows.length);
    if (navTarget !== null) {
      event.preventDefault();
      event.stopPropagation();
      focusRow(navTarget);
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const prior = typeaheadRef.current;
      const buffer = event.timeStamp - prior.at <= TYPEAHEAD_RESET_MS ? prior.buffer + event.key.toLowerCase() : event.key.toLowerCase();
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
      {/* contentClassName caps the content at the viewport width (overriding the ScrollArea's default
          `min-w-max`, which measures past the viewport for horizontal overflow): a members list scrolls
          vertically only, so a long member name TRUNCATES cleanly instead of busting the panel width. */}
      <ScrollArea className="min-h-0 flex-1" contentClassName="w-full !min-w-0">
        <Stack gap="section" onKeyDownCapture={handleKeyDownCapture}>
          {showPeople ? (
            <Stack gap="row" data-slot="members-people">
              <Row gap="field" align="center" justify="between">
                <Text as="span" size="micro" tone="muted" transform="caps">
                  People
                </Text>
                {onInvitePeople === undefined ? null : (
                  <Button type="button" intent="ghost" size="sm" ref={inviteRef} onClick={onInvitePeople} data-testid={testId("invitePeopleButton")}>
                    <Icon icon={UserPlus} size="sm" />
                    Invite people
                  </Button>
                )}
              </Row>
              {people.length === 0 ? <Text tone="muted">No one else is here yet — share an invite.</Text> : people.map(rowProps)}
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
