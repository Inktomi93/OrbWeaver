// The HOST-side invite mint + the LINK-path preview/redeem verbs (`invites.*` router — all
// `multiHumanProcedure`-belted; the surfaces that fire these mount only while `/api/auth/config
// .multiHumanCapable` is true). Each is a module-scope `createEntityMutation` (§13.1 — the ONE
// mutation home); TVars/TData are tRPC-INFERRED so a wire reshape breaks here at compile time (§5.5).
//
// Mutation-vs-bus audit (data/invalidation.ts):
//   • createInvite — persists an invite row + (targeted) fans the invitee's durable notification;
//     NOTHING this client reads changes (no invite-list surface exists), so `invalidates` is an
//     honest explicit `[]`. The result's `token` returns ONCE — the caller builds the /join link.
//   • previewInvite — semantically a READ riding a mutation (the token-in-URL security shape,
//     transport header); invalidates nothing.
//   • redeemInvite — inserts the caller as a participant and emits `chatUpdated` on a chat bus the
//     joiner is NOT yet subscribed to, and no user-bus `chatsChanged` fans to the joiner — so the
//     joined room's list row is this mutation's own key (`chat.listChats`).

import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

export const useCreateInvite = createEntityMutation<
  inferInput<Trpc["invites"]["createInvite"]>,
  inferOutput<Trpc["invites"]["createInvite"]>
>({
  options: (trpc) => trpc.invites.createInvite.mutationOptions(),
  invalidates: () => [],
  errorToast: "Couldn't create the invite.",
});

export const usePreviewInvite = createEntityMutation<
  inferInput<Trpc["invites"]["previewInvite"]>,
  inferOutput<Trpc["invites"]["previewInvite"]>
>({
  options: (trpc) => trpc.invites.previewInvite.mutationOptions(),
  invalidates: () => [],
  // No errorToast: the join dialog renders the leak-free "invalid or expired" state inline.
});

export const useRedeemInvite = createEntityMutation<
  inferInput<Trpc["invites"]["redeemInvite"]>,
  inferOutput<Trpc["invites"]["redeemInvite"]>
>({
  options: (trpc) => trpc.invites.redeemInvite.mutationOptions(),
  invalidates: (trpc) => [trpc.chat.listChats.pathFilter()],
  errorToast: "Couldn't join — the invite is invalid or expired.",
});
