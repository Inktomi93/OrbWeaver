// THE cross-domain viewer-visibility op (the read-visibility D-entry): membership AND the D16 canon floor,
// resolved together as ONE value, for ONE human over ONE chat. Homed in chat because both halves are chat's —
// `chat_participants` has ONE loader here (the `no-direct-users-read`/membership chokepoint) and the floor has
// ONE resolver (`substrate/auth/clamp::resolveHistoryFloorSeq`).
//
// WHY IT EXISTS (this is a security seam, not a convenience): every non-chat domain that must decide "may this
// human see this chat's CONTENT" previously asked membership on its own and stopped at "yes" — which is
// exactly how the plugin fan-out shipped pre-join canon to a clamped member (the leak this op closes). Handing
// membership back WITHOUT the floor is a latent leak by construction, because the next consumer will not go
// looking for a second call. So there is no membership-only projection here: a caller that only wanted "is
// this person a member" still receives the floor, and "forgot to clamp" stops being representable.
//
// A STANDALONE compose-built factory, not a `ChatService` verb: it takes no Principal (the consuming domain
// runs its own authority gate around it) — the `createGetMembership`/`createExtractQuiet` precedent. `userId`
// is the VIEWER and MUST be a server-resolved identity at the composition root, never a value that crossed a
// wire or a plugin realm (the injected-op caller-gate rule).
//
// NO SECOND CLAMP HOME: the floor is DERIVED here by calling the one resolver — never re-implemented. If the
// resolver's inputs widen (e.g. role-aware "authority implies visibility"), this op passes the whole loaded
// membership row through, so it inherits the change instead of drifting from it.

import type { ChatContext } from "../context";
import type { ResolveViewerVisibility } from "../contract/context";
import { loadPresentVisibilityRow } from "../persistence/roster";
import { resolveHistoryFloorSeq } from "../substrate/auth";
import { viewerReadsHidden } from "../substrate/member-visibility";

/** Only the db — the verdict is a pure function of the caller's own participant row (the `guard.ts::GuardCtx`
 *  narrowing precedent), so the composition root can build this op without the full chat DI bundle. */
type VisibilityCtx = Pick<ChatContext, "db">;

export function createResolveViewerVisibility(ctx: VisibilityCtx): ResolveViewerVisibility {
  return async (chatId, userId) => {
    const membership = await loadPresentVisibilityRow(ctx.db, chatId, userId);
    // `null` (not a present member / no such chat) is the ONE leak-free answer AND the fail-closed sentinel:
    // an absent member must never surface as "floor 0", which reads as UNCLAMPED to a consumer.
    if (membership === null) {
      return null;
    }
    return { role: membership.role, historyFloorSeq: resolveHistoryFloorSeq(membership), readsHidden: viewerReadsHidden(membership) };
  };
}
