// The MEMBERS-row per-row MENU — the §7.1 canonical action home (rule 10: one canonical label + icon
// per action, everywhere). Builds the `@orb/ui/menu` item set for a row from the action seams the
// surface wired (host-only callbacks are ABSENT for a member — §8.1 — so a row with zero actions
// renders no menu at all): Cast rows = Mute/Unmute · Talkativeness… (opens the anchored popover) ·
// Make X speak next (force-turn; stays available for a MUTED member — #29, mute is passive arbitration
// exclusion) · View character (the FINAL-Chats §9e cross-section jump). Person rows = Hand off host… ·
// the D16 join-history toggle (host-only: hide/reveal the canon sent before that member joined) ·
// Kick… (host, on others) / Leave chat… (the viewer's own row) — destructive rows LAST, behind the
// AlertDialog confirms the row shell owns (member-row.tsx).

import { CircleUser, Crown, Eye, EyeOff, Icon, LogOut, UserX, Volume2, VolumeX, Zap } from "@orb/ui/icons";
import { MenuItem, MenuSeparator } from "@orb/ui/menu";
import type { ReactNode } from "react";
import type { MEMBER_ROW_CONFIRMS, MemberCastRow, MemberPersonRow, MemberRowActions } from "../lib/member-rows.ts";

/** Which of a person row's dialogs is open — DERIVED from the one homed tuple, never re-spelled (a fourth
 *  arm must break every consumer at compile time). Local per file: an exported client alias would have to
 *  live in a type home, and this axis is chat-row-local UI state. */
type MemberRowConfirm = (typeof MEMBER_ROW_CONFIRMS)[number];

/** The shell's per-row control seams the menu items reach back into (confirm state + the weight
 *  popover's opener — both owned by `MemberRow`, member-row.tsx). */
export interface MemberMenuControls {
  readonly setConfirm: (confirm: MemberRowConfirm) => void;
  readonly openWeight: () => void;
}

/** The per-row Menu items — ALL of a row's actions (rule 10); destructive rows LAST. Empty array ⇒
 *  the row renders no menu (a member viewing another human). */
export function buildMenuItems(props: MemberRowActions & { readonly row: MemberPersonRow | MemberCastRow }, controls: MemberMenuControls): ReactNode[] {
  return props.row.kind === "cast" ? castMenuItems(props.row, props, controls.openWeight) : personMenuItems(props.row, props, controls.setConfirm);
}

function castMenuItems(row: MemberCastRow, actions: MemberRowActions, openWeight: () => void): ReactNode[] {
  const items: ReactNode[] = [];
  if (actions.onSetDisabled !== undefined) {
    items.push(
      <MenuItem key="mute" onClick={(): void => actions.onSetDisabled?.(row.characterId, !row.disabled)}>
        <Icon icon={row.disabled ? VolumeX : Volume2} size="sm" />
        {row.disabled ? `Unmute ${row.displayName}` : `Mute ${row.displayName}`}
      </MenuItem>,
    );
  }
  if (actions.onSetTalkativeness !== undefined) {
    items.push(
      <MenuItem key="talk" onClick={openWeight}>
        <Icon icon={Volume2} size="sm" />
        Talkativeness…
      </MenuItem>,
    );
  }
  if (actions.onForceTurn !== undefined) {
    items.push(
      <MenuItem key="force" onClick={(): void => actions.onForceTurn?.(row.characterId)}>
        <Icon icon={Zap} size="sm" />
        {`Make ${row.displayName} speak next`}
      </MenuItem>,
    );
  }
  if (actions.onViewCharacter !== undefined) {
    items.push(
      <MenuItem key="view" onClick={(): void => actions.onViewCharacter?.(row.characterId)}>
        <Icon icon={CircleUser} size="sm" />
        View character
      </MenuItem>,
    );
  }
  // Destructive row LAST (the header rule): the symmetric drop for the cast-bar add. leftSeq-stamps the
  // seat out server-side and is reversible via a re-add, so a direct action (like Mute) — no hard-delete
  // confirm. Host-only seam: absent for a member (§8.1), so this never renders for a non-host.
  if (actions.onRemoveCharacter !== undefined) {
    if (items.length > 0) {
      items.push(<MenuSeparator key="sep" />);
    }
    items.push(
      <MenuItem key="remove" onClick={(): void => actions.onRemoveCharacter?.(row.characterId)}>
        <Icon icon={UserX} size="sm" />
        {`Remove ${row.displayName} from chat`}
      </MenuItem>,
    );
  }
  return items;
}

function personMenuItems(row: MemberPersonRow, actions: MemberRowActions, setConfirm: (confirm: MemberRowConfirm) => void): ReactNode[] {
  const items: ReactNode[] = [];
  if (row.isViewer) {
    if (actions.onLeave !== undefined) {
      items.push(
        <MenuItem key="leave" onClick={(): void => setConfirm("leave")}>
          <Icon icon={LogOut} size="sm" />
          Leave chat…
        </MenuItem>,
      );
    }
    return items;
  }
  // The ellipsis is honest: handing off the room opens a confirm that also carries the OPT-IN property
  // offer (the departing host may give point-in-time copies of the cast + lore they brought). It used to
  // fire immediately despite the "…" — the confirm is where the offer now lives.
  if (actions.onNominateHost !== undefined) {
    items.push(
      <MenuItem key="handoff" onClick={(): void => setConfirm("handoff")}>
        <Icon icon={Crown} size="sm" />
        Hand off host…
      </MenuItem>,
    );
  }
  // D16 join-history — the host-only per-member read horizon. Label states what CHANGES (the direction),
  // never a mode name: the current state is the row's "Limited history" badge. Honest about the mechanism —
  // this never moves when they joined, only whether they may read below it, so "since they joined" is the
  // member's EXISTING join point, and both directions take effect on their next read.
  if (actions.onSetHistoryVisibility !== undefined) {
    const restricted = row.historyVisibility === "from-join";
    items.push(
      <MenuItem key="history" onClick={(): void => actions.onSetHistoryVisibility?.(row.userId, restricted ? "full" : "from-join")}>
        <Icon icon={restricted ? Eye : EyeOff} size="sm" />
        {restricted ? `Let ${row.displayName} read all earlier messages` : `Hide messages sent before ${row.displayName} joined`}
      </MenuItem>,
    );
  }
  if (actions.onKick !== undefined) {
    if (items.length > 0) {
      items.push(<MenuSeparator key="sep" />);
    }
    items.push(
      <MenuItem key="kick" onClick={(): void => setConfirm("kick")}>
        <Icon icon={UserX} size="sm" />
        Kick…
      </MenuItem>,
    );
  }
  return items;
}
