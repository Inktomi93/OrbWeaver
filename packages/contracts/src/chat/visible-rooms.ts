// contracts/chat/visible-rooms — the LEAK-SAFE reverse-room read, as ONE shape and ONE op type.
//
// WHY IT IS CHAT'S AND NOT ITS CONSUMERS'. A room carries no `ownerId` (D18): its scope is
// `chat_participants`, so "which of these rooms may this caller SEE, and what does a row need to name them"
// is a chat question with a chat answer. Three libraries now ask it about their own attachment junctions —
// regex (`regex.listScriptUsage`), databank (`databank.listAttachments`) and preset (`preset.listUsage`) —
// and none of them may read the roster (a domain never imports a sibling domain's runtime, AGENTS §2). So
// the SHAPE lives here, beside the rest of chat's wire vocabulary, and the RUNTIME is one factory at the
// composition root (`entry/compose/visible-rooms.ts`) injected into each consumer's DI bundle.
//
// WHY IT EXISTS AT ALL — the leak it closes. An attachment row OUTLIVES its author's seat: `attachToChat`
// is host-gated, membership is revocable, and the junction row is not deleted when a member leaves. Reading
// those chat ids straight off the junction and naming them would tell an ex-member that a room they can no
// longer open still exists and still runs their script / feeds on their document. The op's answer is
// PRESENT membership only, and an unresolvable room is simply ABSENT — the same leak-free collapse
// `requireParticipant` makes, without a throw (a roster of 3 where the caller can see 2 is a roster of 2,
// not an error, and not a "and 1 more" residue that would leak the count).
//
// IT RESOLVES THE NAMING INPUTS, IT DOES NOT NAME (owner pick 2026-08-09, REGROSTER's parked question). A
// room's display title is a fallback CHAIN (authored title → the present characters' display names → "Untitled
// chat") whose ONE home is the client's `deriveChatTitle` — the chats list, the topbar, the palette and
// every usage roster run it. A server-side name would be a second copy of that rule, and the two-of-three
// rungs it actually implemented is what made every unnamed room read "Untitled chat" in a roster while the
// chats list two panes over called the same room by its characters.

import type { ChatId } from "@orb/kit/ids";
import type { Principal } from "#identity";

/**
 * ONE room a caller may see, as the naming chain's INPUTS.
 *
 * `at` is the room's last-activity instant — the same `chats.updatedAt` the chats list ORDERS by. It rides
 * the row for the same reason the chats list carries it: once rooms are titled by their characters, several rooms
 * legitimately share one title, and the recency stamp is the house disambiguator (`rowQualifiers`).
 */
export interface VisibleRoomRef {
  readonly id: ChatId;
  /** The AUTHORED title, raw and untrimmed — null or blank means "never renamed", which the chain answers. */
  readonly title: string | null;
  /** The present characters' display names, in roster order, MINUS the caller's own seat (the chats list's own
   *  `summaryParticipantNames` rule: the viewer is in every room they can see, so their name carries no information about
   *  which characters are present). */
  readonly participantNames: readonly string[];
  /** Last activity (`chats.updatedAt`), epoch-ms. */
  readonly at: number;
}

/**
 * The injected reverse-roster filter: of these CANDIDATE rooms, the ones this caller may see.
 *
 * It takes candidates rather than answering "every room this user is in": the candidates are the rooms an
 * attachment already points at, so the op filters a bounded set instead of enumerating a library. Rooms
 * come back NEWEST-FIRST (`chats.updatedAt` DESC, id breaking the tie) — a name sort is not available
 * (the server does not know the names) and recency is the order the user already reads their rooms in.
 */
export type ResolveVisibleRoomsOp = (principal: Principal, chatIds: readonly ChatId[]) => Promise<readonly VisibleRoomRef[]>;
