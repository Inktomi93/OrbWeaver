// `useRosterPresence` — the roster's live-presence read (#1039). The ONE client consumer of
// `notifications.presence`: it asks about the human seats this room actually has and returns the set the
// server reported ONLINE, or `null` while presence is UNKNOWN.
//
// NULL IS A STATE, NOT A FALLBACK. Unresolved, unasked (no human seats / a single-human deployment, where
// the procedure's multi-human belt refuses it as nonexistent), or errored all yield `null`, and
// `toPersonRows` propagates that to every row as `online: null` → no dot, no announced word. Collapsing any
// of those to `false` would publish "everyone is offline" as a fact the client never learned.
//
// IT IS A POLL, NOT A STREAM, and the reason is structural rather than a shortcut. Presence has no bus: the
// registry is a ref-count with no event and no fan-out, and the roster it decorates is itself a QUERY
// (`ChatDetail`) refreshed by invalidation, not a stream frame. A presence FRAME would mean minting a
// presence bus, a per-room member fan-out and a grace-window timer to fire the offline edge — a subsystem,
// which #1039 explicitly is not. A poll also matches the physics: the server debounces disconnects behind a
// 15 s grace window, so presence is a coarse fact by construction and nothing is gained by sub-second
// delivery.
//
// THE ASK IS BOUNDED AND SORTED. Sorted so the query KEY is canonical (roster order changing must not
// thrash the cache into a refetch); bounded because the wire caps the ask at `PRESENCE_READ_MAX_USER_IDS`
// and a room past that cap must degrade to "unknown" rather than send a request the transport will reject.

import type { ParticipantView } from "@orb/contracts/chat";
import type { PresenceSnapshot } from "@orb/contracts/notifications";
import { PRESENCE_READ_MAX_USER_IDS } from "@orb/contracts/notifications";
import type { UserId } from "@orb/kit/ids";
import { usePresenceRead } from "#data";
import { resolveHumanParticipants } from "../lib/roster.ts";

/** The human seats of `participants` whose presence is worth asking about — present members only (a kicked
 *  or departed seat renders no row, so its presence is nobody's question), deduplicated and sorted for a
 *  canonical query key. Empty when the roster is over the wire cap, which reads as UNKNOWN downstream.
 *  MUTABLE by return type on purpose: the wire schema infers `UserId[]`, and a `readonly` array is not
 *  assignable to it. */
function presenceAsk(participants: readonly ParticipantView[]): UserId[] {
  const userIds = new Set<UserId>();
  for (const p of resolveHumanParticipants(participants)) {
    if (p.userId !== null) {
      userIds.add(p.userId);
    }
  }
  if (userIds.size > PRESENCE_READ_MAX_USER_IDS) {
    return [];
  }
  return [...userIds].sort();
}

/**
 * The set of this room's human seats currently reported ONLINE, or `null` while presence is unknown.
 *
 * @param participants - the room's roster wire array; the human subset is derived here so a caller never
 *   has to build the ask itself (one home for "which ids does this room's dot need").
 * @param enabled - `false` on a deployment that cannot seat a second human: the read is refused there, and
 *   asking would only produce a 404 per mount.
 */
export function useRosterPresence(participants: readonly ParticipantView[], enabled: boolean): ReadonlySet<UserId> | null {
  const userIds: UserId[] = enabled ? presenceAsk(participants) : [];
  const { data } = usePresenceRead(userIds);
  // Pin the wire type: the `skipToken` + spread `useQuery` inference degrades `data` to `any` in some
  // type-graph states (the `use-send-availability.ts` precedent), and `null` is also what the CT stub
  // yields for a read nobody fed — both must land on the UNKNOWN arm rather than on a `.onlineUserIds`
  // read that throws.
  const snapshot: PresenceSnapshot | null | undefined = data;
  return snapshot ? new Set(snapshot.onlineUserIds) : null;
}
