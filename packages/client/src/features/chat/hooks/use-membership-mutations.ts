// The HUMAN membership-lifecycle write verbs (FINAL-Chats §8.3 — the Members panel + options-menu rows),
// each a module-scope `createEntityMutation` (§13.1 — the ONE mutation home). All ride the
// `multiHumanProcedure`-belted `invites.*` router (PD-106): the surfaces that fire these mount only while
// `/api/auth/config.multiHumanCapable` is true, and authority (requireHost / requireParticipant / the
// nominee self-check) lives INSIDE each verb. TVars reuse the contract param shapes so a wire reshape
// breaks here at compile time (§5.5); TData is `unknown` (returns are never read — bus/invalidation drive).
//
// Mutation-vs-bus audit (data/invalidation.ts):
//   • kick — the verb emits `chatUpdated` on the OPEN chat (the host is subscribed) AND fans the user-bus
//     `chatsChanged` to everyone affected → fully bus-driven for the kicking host's reads.
//   • selfLeave — emits `chatUpdated` on a room the LEAVER is about to lose (their SSE tears down with the
//     navigation) and no user-bus fan reaches them for their OWN list drop → the left chat's list row is
//     this mutation's own key (`chat.listChats`). The caller navigates `goToLanding()` after (the room
//     would 404), so `getChat` is never re-read.
//   • nominateHostHandoff — emits `chatUpdated` on the OPEN chat (the nominating host is subscribed);
//     `ChatDetail.pendingHostUserId` refreshes via the bus → busDriven.
//   • setMemberHistoryVisibility — emits `chatUpdated` on the OPEN chat, which both the host and the target
//     member are subscribed to; `chatUpdated → chatReads` already covers the two reads it moves (`getChat`
//     for the roster's `joinHistoryVisibility`, `listMessages` for the target's re-clamped canon) → busDriven.
//   • acceptHostHandoff lives in `features/notifications` (its firing surface is the inbox row — features
//     are islands; each feature owns its own mutations over the shared trpc contract).

import type { HandoffOffer, JoinHistoryVisibility } from "@orb/contracts/chat";
import type { ChatId, UserId } from "@orb/kit/ids";
import { createEntityMutation } from "#data";

/** `invites.kick` vars — host removes a present HUMAN member (their authored rows remain; canon is history). */
interface KickMemberVars {
  readonly chatId: ChatId;
  readonly userId: UserId;
}

export const useKickMember = createEntityMutation<KickMemberVars, unknown>({
  options: (trpc) => trpc.invites.kick.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't remove that member.",
});

/** `invites.selfLeave` vars — leave your own membership (a sole-host leave archives the room server-side). */
interface SelfLeaveVars {
  readonly chatId: ChatId;
}

export const useSelfLeave = createEntityMutation<SelfLeaveVars, unknown>({
  options: (trpc) => trpc.invites.selfLeave.mutationOptions(),
  // The leaver's own chat list drops the room and no delivered bus event covers it (header audit).
  invalidates: (trpc) => [trpc.chat.listChats.pathFilter()],
  errorToast: "Couldn't leave the chat.",
});

/** `invites.setMemberHistoryVisibility` vars — host sets how much room canon one HUMAN member may read
 *  (D16 `joinHistoryVisibility`: `full` = the whole canon, the default; `from-join` = only from their own
 *  join point). Never moves their join point — it changes what they may read from it. */
interface SetMemberHistoryVisibilityVars {
  readonly chatId: ChatId;
  readonly userId: UserId;
  readonly visibility: JoinHistoryVisibility;
}

export const useSetMemberHistoryVisibility = createEntityMutation<SetMemberHistoryVisibilityVars, unknown>({
  options: (trpc) => trpc.invites.setMemberHistoryVisibility.mutationOptions(),
  // Bus-driven: the verb emits `chatUpdated` on the OPEN chat → `chatReads` (getChat, which carries the
  // roster's `joinHistoryVisibility`, AND listMessages, which the TARGET member's clamp just moved). Both the
  // setting host and the affected member are subscribed, so no mutation-side filter and no new bus row.
  busDriven: true,
  errorToast: "Couldn't change what that member can read.",
});

/** `invites.nominateHostHandoff` vars — host nominates a present member as the new host (step 1 of two).
 *  `offer` is the departing host's OPT-IN point-in-time property gift (the confirm step's checkbox), stored
 *  with the nomination and executed only if the nominee ACCEPTS. Omitted / all-false = give nothing = the
 *  built D64 behavior. */
interface NominateHostHandoffVars {
  readonly chatId: ChatId;
  readonly userId: UserId;
  readonly offer?: HandoffOffer | undefined;
}

export const useNominateHostHandoff = createEntityMutation<NominateHostHandoffVars, unknown>({
  options: (trpc) => trpc.invites.nominateHostHandoff.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't nominate that member as host.",
});
