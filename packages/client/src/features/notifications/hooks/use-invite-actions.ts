// The invitee's notification->invite actions: Accept rides invites.acceptInvite, Decline rides
// invites.declineInvite. Accept's chatUpdated bus emission never reaches the accepting device (it
// wasn't subscribed to a room it just joined), so the joined chat's list row is this mutation's own key
// to reconcile.

import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

/** `redeemInvite`'s success twin — `{ chat, participant }` (the bell navigates into `chat.id`). */
type AcceptResult = inferOutput<Trpc["invites"]["acceptInvite"]>;

export const useAcceptInvite = createEntityMutation<inferInput<Trpc["invites"]["acceptInvite"]>, AcceptResult>({
  options: (trpc) => trpc.invites.acceptInvite.mutationOptions(),
  invalidates: (trpc) => [trpc.chat.listChats.pathFilter()],
  errorToast: "Couldn't join — the invite is invalid or expired.",
});

export const useDeclineInvite = createEntityMutation<inferInput<Trpc["invites"]["declineInvite"]>, unknown>({
  options: (trpc) => trpc.invites.declineInvite.mutationOptions(),
  invalidates: () => [],
  errorToast: "Couldn't decline the invite.",
});
