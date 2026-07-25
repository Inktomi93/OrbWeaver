// The MEMBERS-panel row MODEL (FINAL-Chat-Tab-Redesign §7.1 — the Roster+People merge): the
// source-agnostic row views both surfaces project into (committed roster / draft founding cards),
// the roving-focus + action-seam prop contracts, and the accessible-name derivation. Pure — no JSX
// (the row shell is components/member-row.tsx; the canonical action home is member-row-menu.tsx).

import type { CharacterId, UserId } from "@orb/kit/ids";

/** A PEOPLE (human) row view — projected by the surface from `ParticipantView` (+ `pendingHostUserId`). */
export interface MemberPersonRow {
  readonly kind: "person";
  /** Stable row key (the participant id) — the roving-focus registry key. */
  readonly key: string;
  readonly userId: UserId;
  readonly displayName: string;
  readonly handle: string | null;
  readonly isHost: boolean;
  /** The viewer's own seat ("you" marker + the Leave action home). */
  readonly isViewer: boolean;
  readonly avatarHash: string | null;
  /** The pending host-handoff nominee (host view chip, FINAL-Chats §8.3) — cleared on accept. */
  readonly pendingNominee: boolean;
}

/** A CAST (character) row view — source-agnostic (committed roster OR draft founding cards). */
export interface MemberCastRow {
  readonly kind: "cast";
  readonly key: string;
  readonly characterId: CharacterId;
  readonly displayName: string;
  readonly disabled: boolean;
  readonly talkativeness: number;
  readonly avatarHash: string | null;
  /** The live turn's voiced speaker (`turnStarted.speakerCharacterId` — NEVER a token read, §7.1). */
  readonly responding: boolean;
}

/** The roving-tabindex plumbing every row receives from the panel (one tab stop per panel). */
export interface MemberRowFocusProps {
  readonly tabIndex: 0 | -1;
  readonly registerRef: (key: string, el: HTMLButtonElement | null) => void;
  readonly onRowFocus: (key: string) => void;
}

/** The action seams a row may carry — all optional (the surface mirrors the server gates: host-only
 *  controls are simply absent for a member; a row with zero actions renders no menu at all, §8.1). */
export interface MemberRowActions {
  readonly onKick?: ((userId: UserId) => void) | undefined;
  readonly onNominateHost?: ((userId: UserId) => void) | undefined;
  readonly onLeave?: (() => void) | undefined;
  /** Sole-host leave archives the room — the confirm copy must say so (FINAL-Chats §8.3). */
  readonly leaveArchivesRoom?: boolean | undefined;
  readonly onSetDisabled?: ((characterId: CharacterId, disabled: boolean) => void) | undefined;
  readonly onSetTalkativeness?: ((characterId: CharacterId, talkativeness: number) => void) | undefined;
  readonly onForceTurn?: ((characterId: CharacterId) => void) | undefined;
  /** Peel a cast member out of the roster (host-only; the symmetric drop for the cast-bar add).
   *  leftSeq-stamps the seat out server-side — reversible via a re-add, so no hard-delete confirm. */
  readonly onRemoveCharacter?: ((characterId: CharacterId) => void) | undefined;
  readonly onViewCharacter?: ((characterId: CharacterId) => void) | undefined;
  /** Panel focus bookkeeping: called when a KICK is confirmed so the panel can land focus on a
   *  neighbor once the bus echo removes the row (post-destructive focus, §7.1). */
  readonly onRequestRemovalFocus?: ((key: string) => void) | undefined;
}

/** Identity + state — the row's accessible NAME (§7.1 examples: "Aria — character, muted" ·
 *  "Riley — host" · "you"). */
export function rowAccessibleName(row: MemberPersonRow | MemberCastRow): string {
  if (row.kind === "person") {
    const role = row.isHost ? "host" : "member";
    const you = row.isViewer ? ", you" : "";
    const nominated = row.pendingNominee ? ", nominated as host" : "";
    return `${row.displayName} — ${role}${you}${nominated}`;
  }
  return `${row.displayName} — character${row.disabled ? ", muted" : ""}`;
}
