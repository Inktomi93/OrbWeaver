// The HOST-side invite mint + the LINK-path preview/redeem verbs (`invites.*` router — all
// `multiHumanProcedure`-belted; the surfaces that fire these mount only while `/api/auth/config
// .multiHumanCapable` is true). Each is a module-scope `createEntityMutation` (§13.1 — the ONE
// mutation home); TVars/TData are tRPC-INFERRED so a wire reshape breaks here at compile time (§5.5).
//
// Mutation-vs-bus audit (data/invalidation.ts):
//   • createInvite — persists an invite row + (targeted) fans the invitee's durable notification;
//     the HOST-side read it changes is the invite dialog's outstanding list (`invites.listInvites`) —
//     no bus event covers it (invites aren't room-public), so it is this mutation's own key. The
//     result's `token` returns ONCE — the caller builds the /join link. NO errorToast: the invite
//     dialog surfaces failures inline per mode (the coded target-unknown refusal is field-level copy).
//   • previewInvite — semantically a READ riding a mutation (the token-in-URL security shape,
//     transport header); invalidates nothing.
//   • redeemInvite — inserts the caller as a participant and emits `chatUpdated` on a chat bus the
//     joiner is NOT yet subscribed to, and no user-bus `chatsChanged` fans to the joiner — so the
//     joined room's list row is this mutation's own key (`chat.listChats`).
//   • revokeInvite — flips one invite row's status; same no-bus-event surface as create, so the
//     outstanding list is its own key too.

import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

export const useCreateInvite = createEntityMutation<
  inferInput<Trpc["invites"]["createInvite"]>,
  inferOutput<Trpc["invites"]["createInvite"]>
>({
  options: (trpc) => trpc.invites.createInvite.mutationOptions(),
  invalidates: (trpc) => [trpc.invites.listInvites.pathFilter()],
});

export const useRevokeInvite = createEntityMutation<
  inferInput<Trpc["invites"]["revokeInvite"]>,
  unknown
>({
  options: (trpc) => trpc.invites.revokeInvite.mutationOptions(),
  invalidates: (trpc) => [trpc.invites.listInvites.pathFilter()],
  errorToast: "Couldn't revoke the invite.",
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
