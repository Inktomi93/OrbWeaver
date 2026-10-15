// The MEMBERS-panel row MODEL (FINAL-Chat-Tab-Redesign §7.1 — the Roster+People merge): the
// source-agnostic row views both surfaces project into (committed roster / draft founding cards), the
// PROJECTIONS that build them off a `ParticipantView[]`, the roving-focus + action-seam prop contracts, and
// the accessible-name derivation. Pure — no JSX (the row shell is components/member-row.tsx; the canonical
// action home is member-row-menu.tsx).
//
// THE PROJECTIONS LIVE HERE, not in the tab body, and that is now load-bearing: a human's row must render
// their IN-ROOM identity — the persona they are playing — and must never re-render their login handle as a
// SECOND identity beside it. Under AUTH_MODE=oidc that handle is an email address, and the row used to print
// it twice (`email · email`) in the owner's own Members tab (#162, 2026-08-17: "it just shows my email").
// `MemberPersonRow` therefore carries NO handle field at all: the resolution happens in {@link toPersonRows},
// where the `ParticipantView` still exists, so no row shape a renderer can reach can duplicate one.

import type { ChatIdentity, HandoffOffer, JoinHistoryVisibility, ParticipantView } from "@orb/contracts/chat";
import { buildIdentityAvatarMaps, buildIdentityNameContext } from "@orb/contracts/chat";
import type { CharacterId, UserId } from "@orb/kit/ids";

/** A PEOPLE (human) row view — projected by {@link toPersonRows} from `ParticipantView`. */
export interface MemberPersonRow {
  readonly kind: "person";
  /** Stable row key (the participant id) — the roving-focus registry key. */
  readonly key: string;
  readonly userId: UserId;
  /** The seat's IN-ROOM identity: the persona this human is playing, else the room-neutral floor. NEVER a
   *  login handle — see the file header. Derived once, in {@link toPersonRows}. */
  readonly displayName: string;
  readonly isHost: boolean;
  /** The viewer's own seat ("you" marker + the Leave action home). */
  readonly isViewer: boolean;
  readonly avatarHash: string | null;
  /** The pending host-handoff nominee (host view chip, FINAL-Chats §8.3) — cleared on accept. */
  readonly pendingNominee: boolean;
  /** D16 — how much of the room's canon this member may read (`full` = all of it, the default;
   *  `from-join` = only from their own join point). The host flips it from this row's menu. */
  readonly historyVisibility: JoinHistoryVisibility;
  /** Live presence (#1039): `true` online · `false` offline · **`null` = NOT KNOWN**, which is its own
   *  state and never a synonym for offline. Null is what a surface that never asked, a read still in
   *  flight, and a deployment that refuses the read all produce — the row renders no indicator at all
   *  there rather than asserting an absence it cannot see. Server-derived from the live socket ref-count;
   *  never a client heartbeat (client-architecture-lockdown.md §6). */
  readonly online: boolean | null;
}

/** A CHARACTER-SEAT row view — source-agnostic (committed roster OR draft founding cards). */
export interface MemberCharacterRow {
  readonly kind: "character";
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

/** Which of a person row's dialogs is open. A TUPLE (not an inline union) because the row shell and the
 *  menu builder both name the axis — a fourth arm must break both at compile time, not just the one someone
 *  remembered to edit; each consumer derives its own local alias off this one home. `handoff` is not
 *  destructive; it is on this axis because it is the other row action whose label ends in "…". */
export const MEMBER_ROW_CONFIRMS = ["kick", "leave", "handoff"] as const;

/** The action seams a row may carry — all optional (the surface mirrors the server gates: host-only
 *  controls are simply absent for a member; a row with zero actions renders no menu at all, §8.1). */
export interface MemberRowActions {
  readonly onKick?: ((userId: UserId) => void) | undefined;
  /** Hand the room to this member (host-only). `offer` is the departing host's OPT-IN property gift — the
   *  confirm step's checkbox — and DEFAULTS TO GIVING NOTHING: a `{copyCharacters:false, copyGmPreset:false}` offer
   *  is byte-identical to the pre-offer handoff (the new host adds their own characters, D64). */
  readonly onNominateHost?: ((userId: UserId, offer: HandoffOffer) => void) | undefined;
  readonly onLeave?: (() => void) | undefined;
  /** Set how much room canon a human member may read (host-only; D16). Absent for a non-host — the
   *  action simply doesn't render (§8.1). */
  readonly onSetHistoryVisibility?: ((userId: UserId, visibility: JoinHistoryVisibility) => void) | undefined;
  /** Sole-host leave archives the room — the confirm copy must say so (FINAL-Chats §8.3). */
  readonly leaveArchivesRoom?: boolean | undefined;
  readonly onSetDisabled?: ((characterId: CharacterId, disabled: boolean) => void) | undefined;
  readonly onSetTalkativeness?: ((characterId: CharacterId, talkativeness: number) => void) | undefined;
  readonly onForceTurn?: ((characterId: CharacterId) => void) | undefined;
  /** Peel a character seat out of the roster (host-only; the symmetric drop for the character-bar add).
   *  leftSeq-stamps the seat out server-side — reversible via a re-add, so no hard-delete confirm. */
  readonly onRemoveCharacter?: ((characterId: CharacterId) => void) | undefined;
  readonly onViewCharacter?: ((characterId: CharacterId) => void) | undefined;
  /** Panel focus bookkeeping: called when a KICK is confirmed so the panel can land focus on a
   *  neighbor once the bus echo removes the row (post-destructive focus, §7.1). */
  readonly onRequestRemovalFocus?: ((key: string) => void) | undefined;
}

/** The presence CLAUSE of a person row's accessible name (#1039) — the whole non-colour channel, since the
 *  dot itself is `aria-hidden`. UNKNOWN (`null`) contributes NOTHING: claiming "offline" for a read that
 *  never resolved is the one lie this field can tell. Split out of {@link rowAccessibleName} because the
 *  three-way state needs a branch, and a nested ternary is banned house-wide (biome `noNestedTernary`). */
function presenceClause(online: boolean | null): string {
  if (online === null) {
    return "";
  }
  return online ? ", online" : ", offline";
}

/** Identity + state — the row's accessible NAME (§7.1 examples: "Aria — character, muted" ·
 *  "Riley — host" · "you"). */
export function rowAccessibleName(row: MemberPersonRow | MemberCharacterRow): string {
  if (row.kind === "person") {
    const role = row.isHost ? "host" : "member";
    const you = row.isViewer ? ", you" : "";
    const nominated = row.pendingNominee ? ", nominated as host" : "";
    // The non-default D16 posture is state, so it rides the accessible NAME (the character row's ", muted" precedent).
    const history = row.historyVisibility === "from-join" ? ", limited history" : "";
    // Presence is the row's NON-COLOUR channel (#1039): the dot is `aria-hidden` decoration, so this word
    // is the whole announcement — a colour-blind or screen-reader user reads the state a sighted one sees.
    return `${row.displayName} — ${role}${you}${nominated}${history}${presenceClause(row.online)}`;
  }
  return `${row.displayName} — character${row.disabled ? ", muted" : ""}`;
}

/** What the committed roster hands the two projections below. `identities` is the chat's own member-gated
 *  CHAT IDENTITY producer (`ChatDetail.identities`, D137) — the ONE place a client can resolve a seat's
 *  `activePersonaId` into the persona's name and portrait, with no second name-resolver invented here. */
export interface MemberRowSources {
  readonly participants: readonly ParticipantView[];
  readonly identities: readonly ChatIdentity[];
  readonly viewerUserId: UserId | null;
  readonly pendingHostUserId: UserId | null;
  /** The live turn's voiced speaker (`turnStarted.speakerCharacterId`) — never a token read (§7.1). */
  readonly respondingCharacterId: CharacterId | null;
  /** The human seats the presence read reported ONLINE (`notifications.presence`, #1039), or `null` while
   *  presence is unknown — unresolved, unasked, or refused by the deployment. A userId's ABSENCE from a
   *  non-null set means offline OR undisclosed: the server collapses both to the same answer on purpose,
   *  so the client must not read absence as anything richer than "not shown as online". */
  readonly onlineUserIds: ReadonlySet<UserId> | null;
}

/**
 * THE HUMAN-SEAT PROJECTION — and the one home of "what is this human called in this room".
 *
 * The room renders the PERSONA, because that is what a human IS here (`Spine-Identity-and-Auth`: the pin is
 * the anchor `{{user}}`, the active persona is per-participant). The persona name is resolved from the seat's
 * own `activePersonaId` against the chat's identity producer — deliberately NOT from `ParticipantView.displayName`,
 * even though the server's rule already collapses persona-then-handle into that field: the collapsed value
 * cannot tell a caller WHICH arm it took, and the losing arm is a raw login handle.
 *
 * A seat holding NO persona falls back to `ParticipantView.displayName` — which, on an account with no display
 * name, is the server's handle fallback, and under `AUTH_MODE=oidc` that handle is an email address. That is
 * deliberate and SCOPED (orchestrator ruling 2026-08-18): rendering the best label actually on the wire beats
 * rendering a placeholder for a real person, and the durable fix is a display-name column on `users` populated
 * from the OIDC claims — auth-adjacent schema work filed separately. What #162 killed here is the DUPLICATE:
 * the row also appended ` · ${handle}`, so the owner's every seat read `email · email`.
 *
 * A seat with a null `userId` is skipped — `MemberPersonRow.userId` is what every membership action (kick,
 * hand-off, history-visibility) addresses, so a row without one could render but never act.
 */
export function toPersonRows(sources: MemberRowSources): MemberPersonRow[] {
  const { personaNamesById } = buildIdentityNameContext(sources.identities);
  const { personaAvatarsById } = buildIdentityAvatarMaps(sources.identities);
  const rows: MemberPersonRow[] = [];
  // leftSeq === null is the present-and-contributing predicate — a kicked/left human keeps a historical row
  // but must not render as a room member.
  for (const p of sources.participants) {
    if (p.kind !== "human" || p.leftSeq !== null || p.userId === null) {
      continue;
    }
    const persona = p.activePersonaId === null ? undefined : personaNamesById.get(p.activePersonaId);
    const personaAvatar = p.activePersonaId === null ? undefined : personaAvatarsById.get(p.activePersonaId);
    rows.push({
      kind: "person",
      key: p.id,
      userId: p.userId,
      displayName: persona?.name ?? p.displayName,
      isHost: p.role === "host",
      isViewer: sources.viewerUserId !== null && p.userId === sources.viewerUserId,
      // The persona's own portrait when they are playing one — the same `identity-only` precedence the transcript's
      // user rows use (`CHAT_IDENTITY_KIND_POLICY.persona.avatar`); a persona has no participant avatar plane.
      avatarHash: personaAvatar ?? p.avatarHash,
      pendingNominee: sources.pendingHostUserId !== null && p.userId === sources.pendingHostUserId,
      historyVisibility: p.joinHistoryVisibility,
      // `null` propagates: an unresolved presence read leaves every seat UNKNOWN rather than defaulting the
      // whole roster to "offline", which is what a `?? false` here would silently publish.
      online: sources.onlineUserIds === null ? null : sources.onlineUserIds.has(p.userId),
    });
  }
  return rows;
}

/** THE CHARACTER-SEAT PROJECTION — the room's characters, in roster order. */
export function toCharacterRows(sources: MemberRowSources): MemberCharacterRow[] {
  const rows: MemberCharacterRow[] = [];
  for (const p of sources.participants) {
    if (p.kind !== "character" || p.characterId === null) {
      continue;
    }
    rows.push({
      kind: "character",
      key: p.id,
      characterId: p.characterId,
      displayName: p.displayName,
      disabled: p.disabled,
      talkativeness: p.talkativeness,
      avatarHash: p.avatarHash,
      responding: sources.respondingCharacterId !== null && p.characterId === sources.respondingCharacterId,
    });
  }
  return rows;
}
