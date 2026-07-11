// The INVITEE's notification→invite actions (the token-free loop): Accept rides `invites.acceptInvite`
// (self-authorizing by `inviteId` — the invite is bound to the caller's userId; a foreign/share-link id
// is a leak-free NOT_FOUND) and Decline rides `invites.declineInvite`. Both are `multiHumanProcedure`-
// belted server-side; the bell that fires them mounts only while the deployment is capable.
//
// Mutation-vs-bus audit (data/invalidation.ts): accept inserts the caller as a participant and emits
// `chatUpdated` on the CHAT bus — which the accepting device is NOT subscribed to (you can't hold a bus
// on a room you weren't in), and no user-bus `chatsChanged` fans to the joiner on this moment. So the
// joined chat's list row is THIS mutation's own key to reconcile (`chat.listChats`). The inbox row is
// dismissed explicitly by the bell after either action (the dismiss mutation carries the inbox
// invalidate) — acting on an invite is what clears it, per the inbox UX contract.

import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

/** `redeemInvite`'s success twin — `{ chat, participant }` (the bell navigates into `chat.id`). */
type AcceptResult = inferOutput<Trpc["invites"]["acceptInvite"]>;

export const useAcceptInvite = createEntityMutation<
  inferInput<Trpc["invites"]["acceptInvite"]>,
  AcceptResult
>({
  options: (trpc) => trpc.invites.acceptInvite.mutationOptions(),
  // The joiner's chat list gains the room; no delivered bus event covers it (header audit).
  invalidates: (trpc) => [trpc.chat.listChats.pathFilter()],
  errorToast: "Couldn't join — the invite is invalid or expired.",
});

export const useDeclineInvite = createEntityMutation<
  inferInput<Trpc["invites"]["declineInvite"]>,
  unknown
>({
  options: (trpc) => trpc.invites.declineInvite.mutationOptions(),
  // Declining changes no client read of its own; the bell's follow-up dismiss reconciles the inbox.
  invalidates: () => [],
  errorToast: "Couldn't decline the invite.",
});
