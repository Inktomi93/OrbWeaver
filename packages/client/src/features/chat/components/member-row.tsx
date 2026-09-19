// One MEMBERS-panel row SHELL (FINAL-Chat-Tab-Redesign §7.1 — the BINDING row-interaction contract).
// The row BODY is ONE focusable unit — a full-width ghost `Button` that IS the `@orb/ui/menu` trigger,
// so Enter/Space/click/row-tap all open the per-row Menu (the canonical action home — the items live
// in member-row-menu.tsx) and Base UI returns focus to the row on close. The ContextMenu key routes
// through the same trigger (`onContextMenu` → `.click()`); the trailing ⋯ button and the fine-pointer
// inline shortcut cluster are `tabIndex={-1}` SIBLINGS (one tab stop per row — the panel's roving
// tabindex owns the rest), and the inline cluster DUPLICATES two Menu items with identical
// labels/icons, revealed on hover/`:focus-within` at a FINE pointer only (`pointer-coarse:hidden` — at
// coarse it never renders; the ≥44px-floor touch path is row-tap → Menu). The reveal is PAINT-only
// (`ROW_REVEAL`): the cluster holds its box at rest, so hovering the row never moves layout.
//
// Accessible name = identity + state (lib/member-rows.ts `rowAccessibleName`); the character row's "responding…"
// mark is `aria-hidden` visually (a quiet pulse, never `aria-live` — no per-turn SR chatter) and rides
// the row's accessible DESCRIPTION instead.
//
// THE PRESENCE DOT (#1039) IS DECORATION, AND THAT IS THE A11Y ARGUMENT, NOT A SHORTCUT. The row body is a
// Button carrying an explicit `aria-label`, so an `aria-label` on anything INSIDE it is never announced —
// which is why the dot is `aria-hidden` and the word "online"/"offline" rides `rowAccessibleName` instead
// (`role-status-dot.tsx`'s labelled-dot idiom is for a dot that is its own accname owner; this one is not).
// It also carries a SHAPE channel beside the colour one — online is FILLED, offline is a hollow ring — so
// the state survives a colour-blind reader looking at it and a screen reader hearing it. UNKNOWN presence
// renders NO dot: "we did not ask / the read has not landed" is not "offline".
//
// Destructive rows (Kick…/Leave…) sit LAST behind an AlertDialog (`ConfirmDialog`); a kick additionally
// reports itself to the panel (`onRequestRemovalFocus`) so focus lands on a neighbor when the bus echo
// removes the row.

import { blobUrl } from "@orb/contracts/assets";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Crown, Icon, MoreHorizontal, Volume2, VolumeX, Zap } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Menu, MenuPopup, MenuTrigger } from "@orb/ui/menu";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useId, useRef, useState } from "react";
import { ConfirmDialog, HIDE_AT_COARSE, ROW_REVEAL, SettingCheckboxRow } from "#components";
import { cn, rowActionsName } from "#lib";
import type { MEMBER_ROW_CONFIRMS, MemberCharacterRow, MemberPersonRow, MemberRowActions, MemberRowFocusProps } from "../lib/member-rows.ts";
import { rowAccessibleName } from "../lib/member-rows.ts";
import { buildMenuItems } from "./member-row-menu.tsx";
import { TalkativenessPopover } from "./talkativeness-popover.tsx";

/** Which of a person row's dialogs is open — DERIVED from the one homed tuple, never re-spelled (a fourth
 *  arm must break every consumer at compile time). Local per file: an exported client alias would have to
 *  live in a type home, and this axis is chat-row-local UI state. */
type MemberRowConfirm = (typeof MEMBER_ROW_CONFIRMS)[number];

export interface MemberRowProps extends MemberRowFocusProps, MemberRowActions {
  readonly row: MemberPersonRow | MemberCharacterRow;
}

/** One Members row: the focusable body (menu trigger) · fine-pointer inline shortcuts · weight chip ·
 *  the trailing ⋯ · the per-row Menu + confirms. */
export function MemberRow(props: MemberRowProps): ReactElement {
  const { row, tabIndex, registerRef, onRowFocus } = props;
  const bodyRef = useRef<HTMLButtonElement | null>(null);
  const descriptionId = useId();
  const [confirm, setConfirm] = useState<MemberRowConfirm | null>(null);
  const [weightOpen, setWeightOpen] = useState(false);

  const menuItems = buildMenuItems(props, { setConfirm, openWeight: () => setWeightOpen(true) });
  const hasMenu = menuItems.length > 0;
  const responding = row.kind === "character" && row.responding;

  const body = (
    <Button
      intent="ghost"
      size="md"
      tabIndex={tabIndex}
      aria-label={rowAccessibleName(row)}
      {...(responding ? { "aria-describedby": descriptionId } : {})}
      className="min-w-0 flex-1 justify-start"
      ref={(el: HTMLButtonElement | null): void => {
        bodyRef.current = el;
        registerRef(row.key, el);
      }}
      onFocus={(): void => onRowFocus(row.key)}
      onContextMenu={(event): void => {
        // The ContextMenu key / right-click opens the same canonical Menu (§7.1).
        event.preventDefault();
        if (hasMenu) {
          bodyRef.current?.click();
        }
      }}
    >
      <Avatar
        size="sm"
        fallbackDelay={0}
        // Hue-seed: character id for a character seat (matches transcript/library); participant id for a human seat.
        hueSeed={row.kind === "character" ? row.characterId : row.key}
        {...(row.avatarHash === null ? {} : { src: blobUrl(row.avatarHash) })}
      >
        {initialsFor(row.displayName)}
      </Avatar>
      {row.kind === "person" ? <PresenceDot online={row.online} /> : null}
      <Text as="span" voice="label" className={row.kind === "character" && row.disabled ? "min-w-0 truncate text-muted-foreground" : "min-w-0 truncate"}>
        {/* Identity ONLY. The ` · ${handle}` suffix that used to sit here rendered the raw login handle —
            an EMAIL under AUTH_MODE=oidc — beside every human's name (#162); `MemberPersonRow` no longer
            carries a handle at all, so the suffix has nothing to come back from. */}
        {row.displayName}
      </Text>
      <RowStateBadges row={row} />
      {responding ? (
        <>
          {/* Visual mark aria-hidden; the state rides the accessible DESCRIPTION (no aria-live). */}
          <Text as="span" voice="gloss" aria-hidden={true} className="animate-pulse">
            responding…
          </Text>
          <Text as="span" id={descriptionId} className="sr-only">
            responding
          </Text>
        </>
      ) : null}
    </Button>
  );

  return (
    // The BARE `group` rides beside `group/member` because that is what the homed `ROW_REVEAL` posture keys
    // on (packages/client/src/components/row-reveal.ts) — the named group stays for the row's own explicit
    // `group-*/member:` arms.
    <Row gap="field" align="center" className="group group/member" data-slot="member-row">
      {hasMenu ? (
        <Menu>
          <MenuTrigger render={body} />
          <MenuPopup>{menuItems}</MenuPopup>
        </Menu>
      ) : (
        body
      )}

      {row.kind === "character" ? <CharacterInlineCluster row={row} actions={props} /> : null}

      {/* The talkativeness weight chip — the glance readout AND the anchored popover's trigger (§7.1:
          "Talkativeness… opens an anchored popover with the labeled slider"). Menu item + chip both
          open it; pointer users can tap the chip directly. */}
      {row.kind === "character" && props.onSetTalkativeness !== undefined ? (
        <TalkativenessPopover row={row} open={weightOpen} onOpenChange={setWeightOpen} onSetTalkativeness={props.onSetTalkativeness} />
      ) : null}

      {/* The ⋯ affordance — a pointer shortcut into the SAME canonical Menu (tabIndex -1: the row body
          is the one tab stop; keyboard users open the menu with Enter/Space on the row). */}
      {hasMenu ? (
        <Button
          type="button"
          intent="ghost"
          size="icon"
          tabIndex={-1}
          aria-label={rowActionsName(row.displayName)}
          onClick={(): void => bodyRef.current?.click()}
        >
          <Icon icon={MoreHorizontal} size="sm" />
        </Button>
      ) : null}

      {row.kind === "person" ? <PersonRowConfirms row={row} actions={props} confirm={confirm} setConfirm={setConfirm} /> : null}
    </Row>
  );
}

/** The live-presence indicator for a human seat (#1039) — filled = online, hollow ring = offline, ABSENT =
 *  unknown. Purely visual: the announced state is the row's accessible name (see the file header), so this
 *  is `aria-hidden` and must never grow a label of its own (it would be swallowed by the row Button's
 *  `aria-label` anyway, i.e. a label that reads as coverage and announces nothing). */
function PresenceDot({ online }: { readonly online: boolean | null }): ReactElement | null {
  if (online === null) {
    return null;
  }
  return (
    <Text
      as="span"
      aria-hidden={true}
      data-slot="member-presence"
      data-online={online}
      // The SHAPE channel: `bg-success` fills the online dot, and the offline one is an unfilled ring of the
      // same box — two states distinguishable with the colour removed, per the never-colour-alone rule the
      // sibling `role-status-dot.tsx` states.
      className={online ? "size-2 shrink-0 rounded-full bg-success" : "size-2 shrink-0 rounded-full border border-muted-foreground"}
    />
  );
}

/** The quiet state chips beside the name: host crown · "you" · pending nomination · muted. */
function RowStateBadges({ row }: { readonly row: MemberPersonRow | MemberCharacterRow }): ReactElement | null {
  if (row.kind === "character") {
    return row.disabled ? (
      <Badge size="sm" intent="neutral" tone="soft">
        Muted
      </Badge>
    ) : null;
  }
  return (
    <>
      {row.isHost ? (
        <Badge size="sm" tone="soft">
          <Icon icon={Crown} size="xs" />
          Host
        </Badge>
      ) : null}
      {row.isViewer ? (
        <Badge size="sm" intent="neutral" tone="soft">
          you
        </Badge>
      ) : null}
      {row.pendingNominee ? (
        <Badge size="sm" intent="info" tone="soft">
          Nominated
        </Badge>
      ) : null}
      {/* The non-default D16 posture — the read side of the row menu's join-history toggle (the "Muted"
          precedent: the state is glanceable, the menu item states the change). */}
      {row.historyVisibility === "from-join" ? (
        <Badge size="sm" intent="neutral" tone="soft">
          Limited history
        </Badge>
      ) : null}
    </>
  );
}

/** Fine-pointer inline shortcut cluster (mute · force-turn) — duplicates two Menu items with identical
 *  labels/icons; NEVER rendered at a coarse pointer (§7.1: row tap opens the Menu there). */
function CharacterInlineCluster({ row, actions }: { readonly row: MemberCharacterRow; readonly actions: MemberRowActions }): ReactElement | null {
  if (actions.onSetDisabled === undefined) {
    return null;
  }
  const setDisabled = actions.onSetDisabled;
  return (
    // PAINT-only reveal (`ROW_REVEAL`), never a display swap: the cluster stays in flow at a fine pointer so
    // the row's geometry is identical at rest and on hover. The old `hidden` → `flex` swap moved layout under
    // a stationary pointer — the hit-test oscillator the preset list measured (row-reveal.ts; gate
    // `no-hover-display-swap`). `pointer-coarse:hidden` keeps today's coarse behavior (the cluster is never
    // rendered there — the row tap opens the Menu) and is a DEVICE-class swap, which cannot oscillate.
    <Row gap="field" align="center" className={cn(ROW_REVEAL, HIDE_AT_COARSE) ?? ""}>
      <Button
        type="button"
        intent="ghost"
        size="icon"
        tabIndex={-1}
        aria-pressed={row.disabled}
        aria-label={row.disabled ? `Unmute ${row.displayName}` : `Mute ${row.displayName}`}
        onClick={(): void => setDisabled(row.characterId, !row.disabled)}
      >
        <Icon icon={row.disabled ? VolumeX : Volume2} size="sm" />
      </Button>
      {actions.onForceTurn === undefined ? null : (
        <Button
          type="button"
          intent="ghost"
          size="icon"
          tabIndex={-1}
          aria-label={`Make ${row.displayName} speak next`}
          onClick={(): void => actions.onForceTurn?.(row.characterId)}
        >
          <Icon icon={Zap} size="sm" />
        </Button>
      )}
    </Row>
  );
}

/** The HAND-OFF confirm — the one member-row dialog that is a small FORM rather than a yes/no.
 *
 *  Handing off the room is irreversible from the departing host's side (only the new host can hand it back),
 *  so it confirms. The checkbox is the departing host's OPT-IN property offer: their characters and the lore behind
 *  it are theirs, and a transfer that silently copied someone's library — or one that silently stranded the
 *  room's characters — would both be the app deciding something the owner should. It defaults OFF: the
 *  unchanged box reproduces the built behavior exactly (the incoming host brings their own characters, D64).
 *
 *  The copy names what actually happens, not the mechanism: "copies" (they keep theirs), "used in this room"
 *  (never their whole library). The offer is stored at nominate and executed only if the nominee ACCEPTS. */
function HandoffConfirm({
  row,
  actions,
  open,
  setConfirm,
}: {
  readonly row: MemberPersonRow;
  readonly actions: MemberRowActions;
  readonly open: boolean;
  readonly setConfirm: (c: MemberRowConfirm | null) => void;
}): ReactElement {
  const [copyCharacters, setCopyCharacters] = useState(false);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next): void => {
        setConfirm(next ? "handoff" : null);
        if (!next) {
          // The offer is per-decision: a dismissed dialog must not leave a checked box waiting to surprise
          // the next hand-off from this row.
          setCopyCharacters(false);
        }
      }}
      title={`Hand off host to ${row.displayName}?`}
      description={`${row.displayName} becomes the host once they accept. You stay in the chat as a member.`}
      body={
        <SettingCheckboxRow
          label="Also give copies of your characters, world books, regex scripts & GM voice used in this room"
          description="They get their own point-in-time copies when they accept, and their invitation lists exactly what that is. You keep yours, and editing or deleting them later won't change this room."
          checked={copyCharacters}
          onChange={setCopyCharacters}
        />
      }
      confirmIntent="primary"
      confirmLabel="Hand off"
      onConfirm={(): void => {
        // `copyGmPreset` rides the SAME class-level opt-in: the GM voice is part of what the departing host
        // brought to the room, and a room whose preset silently reverts is the same broken gift as a room
        // whose characters silently vanish. A non-game room has no preset for it to reach. The room's regex
        // scripts ride `copyCharacters` server-side for the same reason.
        //
        // ALL FOUR CLASSES ARE NAMED HERE (#1762). The label used to say three and quietly carried the GM
        // voice as well — one flag, four kinds of property, and the box named the ones that were easy to
        // say. "world books" rather than "worldbooks" is this app's own spelling for the noun everywhere
        // else it is shown. The RECEIVING side now states the same four with counts (the nomination's
        // `offer` disclosure), so both ends of the transfer describe it in one vocabulary.
        actions.onNominateHost?.(row.userId, { copyCharacters, copyGmPreset: copyCharacters });
        setCopyCharacters(false);
        setConfirm(null);
      }}
    />
  );
}

/** Destructive confirms — AlertDialog, never an undo-toast (FINAL-Chats §11 rule 8). */
function PersonRowConfirms({
  row,
  actions,
  confirm,
  setConfirm,
}: {
  readonly row: MemberPersonRow;
  readonly actions: MemberRowActions;
  readonly confirm: MemberRowConfirm | null;
  readonly setConfirm: (c: MemberRowConfirm | null) => void;
}): ReactElement {
  return (
    <>
      <HandoffConfirm row={row} actions={actions} open={confirm === "handoff"} setConfirm={setConfirm} />
      <ConfirmDialog
        open={confirm === "kick"}
        onOpenChange={(next): void => setConfirm(next ? "kick" : null)}
        title={`Remove ${row.displayName}?`}
        description="They lose access to this chat. Their messages stay in the transcript."
        confirmLabel="Remove"
        onConfirm={(): void => {
          actions.onRequestRemovalFocus?.(row.key);
          actions.onKick?.(row.userId);
          setConfirm(null);
        }}
      />
      <ConfirmDialog
        open={confirm === "leave"}
        onOpenChange={(next): void => setConfirm(next ? "leave" : null)}
        title="Leave this chat?"
        description={
          actions.leaveArchivesRoom === true
            ? "You're the host — leaving archives this chat for everyone."
            : "You'll lose access until someone invites you again. Your messages stay."
        }
        confirmLabel="Leave"
        onConfirm={(): void => {
          actions.onLeave?.();
          setConfirm(null);
        }}
      />
    </>
  );
}
