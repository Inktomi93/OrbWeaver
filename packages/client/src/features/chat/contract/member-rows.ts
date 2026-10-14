// Client room-row projections: identity/presence state is computed locally from the member-gated wire.
import type { JoinHistoryVisibility } from "@orb/contracts/chat";
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
