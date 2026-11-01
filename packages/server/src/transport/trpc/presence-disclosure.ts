// THE PRESENCE DISCLOSURE SEAM (#1039) — the ONE place that decides who may learn that someone is online.
//
// `presence-registry.ts` is the MECHANISM (a ref-count over open SSE connections, D16: "presence →
// transport"); this file is the POLICY, kept apart on purpose so the audience question has one legible home
// instead of being a condition buried in a router body.
//
// ── THE V1 AUDIENCE, AND WHY IT IS DELIBERATELY WIDE ─────────────────────────────────────────────────────
// OWNER RULING (2026-09-01, #1039), verbatim: "everyone can see who is online — for now at least." Any
// AUTHENTICATED caller may ask about any user id; there is no per-room membership filter in v1. "For now" is
// the load-bearing half — the read is shaped so a later tightening is an edit to `readPresenceDisclosure`
// below (plus the one argument its single call site passes), never a rebuild:
//
//   • ASKING IS PER-ID, NEVER A LISTING. The caller names the user ids it wants an answer about and gets
//     back the online SUBSET. There is no "who is online" enumeration to tighten away later, and the wire
//     ceiling (`PRESENCE_READ_MAX_USER_IDS`) is what stops the per-id shape being brute-forced into one.
//   • A WITHHELD ANSWER IS INDISTINGUISHABLE FROM OFFLINE. An id that is not in the returned subset is
//     offline OR not disclosable — one answer, so a membership filter added here can never become an
//     existence oracle for accounts the asker may not know about.
//   • THE TIGHTENING IS TYPED, NOT REMEMBERED. Adding the viewer's `Principal` + a membership predicate to
//     this function's parameters REDS its one call site (`routers/notifications.ts`) at `tsc`; nothing else
//     on the tree reads the registry for a client.
//
// AUTHENTICATION IS NOT THIS FILE'S JOB and must not be re-implemented here: the procedure rides
// `multiHumanProcedure`, which refuses an unauthenticated caller (401) and a deployment that cannot seat a
// second human (a uniform 404) before this function is ever reached.
//
// WHAT IS DISCLOSED PER ASKED ID: online, or when the user's last device left. The second reaches the same
// wide audience as the first, and the owner chose to show it on the roster. Presence stays SERVER-DERIVED in
// both directions — there is no inbound presence schema, so this read cannot become a client-asserted
// heartbeat (client-architecture-lockdown.md §6).

import type { PresenceLastSeen, PresenceSnapshot } from "@orb/contracts/notifications";
import type { UserId } from "@orb/kit/ids";
import type { PresenceRegistry } from "./presence-registry.ts";

/**
 * Answer a presence ask: the ONLINE subset of `userIds` and the last-seen time of the rest, deduplicated, in
 * first-asked order.
 *
 * Duplicates collapse before the registry is touched, so a caller cannot spend its `PRESENCE_READ_MAX_USER_IDS`
 * budget N times on one id, and the answer can never repeat an id back.
 *
 * @see the file header for the v1 audience ruling and the tightening seam.
 */
export function readPresenceDisclosure(presence: PresenceRegistry, userIds: readonly UserId[]): PresenceSnapshot {
  const onlineUserIds: UserId[] = [];
  const lastSeen: PresenceLastSeen[] = [];
  for (const asked of new Set(userIds)) {
    const { userId, online, lastSeenAt } = presence.read(asked);
    if (online) {
      onlineUserIds.push(userId);
    } else if (lastSeenAt !== null) {
      lastSeen.push({ userId, lastSeenAt });
    }
  }
  return { onlineUserIds, lastSeen };
}
