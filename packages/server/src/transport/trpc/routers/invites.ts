// transport/trpc/routers/invites — the multi-HUMAN membership surface (PD-106 burn-down; FINAL-Auth-Modes
// §7 P1; core/Tier-4-Transport.md §"multi-human surface"). PURE WIRING: the invite lifecycle + the
// human-membership-lifecycle verbs (domain/chat/verbs/{invites,roster}.ts) were built + tested + classified
// in the authority matrix long before this router existed — every procedure here is a thin
// validate → `ctx.services.chat.<verb>` pass-through; authority (requireHost / requireParticipant / the
// nominee self-check) lives INSIDE each verb (the sibling chat-router shape).
//
// EVERY procedure rides `multiHumanProcedure` (the B4 capability belt): while the deployment cannot seat
// a second human the whole router answers NOT_FOUND, leak-free. This router carries the human-membership
// verbs + the owner≠host agent-seat REQUEST (a multi-human consent flow, the nominateHostHandoff shape).
// Actual seating is NOT here — character seating (`chat.addCharacterToChat`, built) and agent seating
// (the D60 design's still-unbuilt seat verb, planned for P6) stay on the ungated chat surface (§9 ruling 3:
// multi-CHARACTER rooms + an owner seating its OWN buddy work in every mode).
//
// TOKEN-CARRYING procedures (`previewInvite`/`redeemInvite`) are `.mutation()` even though preview is
// semantically a read: tRPC queries ride GET with the input in the URL, which would put the RAW invite
// token into access logs/history — the `fetchModels` precedent (Tier-4 Esoteric #9: transport shape
// chosen for the security property, not the read/write semantics). The domain stores only the peppered
// token HASH; these bodies + the `/join/:token` redirect are the token's only transit points.

import {
  acceptInviteSchema,
  createInviteSchema,
  handoffOfferSchema,
  joinHistoryVisibilitySchema,
  previewInviteSchema,
  redeemInviteSchema,
} from "@orb/contracts/chat";
import type { UserId } from "@orb/kit/ids";
import { brandedId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import { multiHumanProcedure, t } from "../trpc.ts";

const createSchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  input: createInviteSchema,
});

const revokeSchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  inviteId: typeIdSchema(ID_PREFIX.chatInvite),
});

const declineSchema = z.object({ inviteId: typeIdSchema(ID_PREFIX.chatInvite) });

const kickSchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  userId: brandedId<UserId>(),
});

const chatScopedSchema = z.object({ chatId: typeIdSchema(ID_PREFIX.chat) });

// The nomination + the departing host's OPTIONAL property offer (stickler 2026-08-03 §5). `offer` absent =
// no offer = the built D64 drop: the wire's DEFAULT is give-nothing, so a client that never learned about the
// arm can never accidentally transfer someone's library.
const nominateSchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  userId: brandedId<UserId>(),
  offer: handoffOfferSchema.optional(),
});

// The D16 per-member join-history policy write (host-only INSIDE the verb). Belongs on THIS router, not the
// ungated chat surface: it governs what a second HUMAN may read, so it is inert — and refused leak-free — in
// a deployment that cannot seat one (the `kick`/`nominateHostHandoff` shape). The wire enum is the ONE-HOME
// `joinHistoryVisibilitySchema` (`@orb/contracts/chat`), the same tuple the DB column's enum derives from.
const setMemberHistoryVisibilitySchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  userId: brandedId<UserId>(),
  visibility: joinHistoryVisibilitySchema,
});

export const invitesRouter = t.router({
  // Host mints a share-link or targeted invite; the RAW token returns exactly once (the /join link).
  createInvite: multiHumanProcedure.input(createSchema).mutation(({ ctx, input }) => ctx.services.chat.createInvite({ principal: ctx.auth, ...input })),

  // Token-authenticated preview-then-confirm read (a mutation for the token-in-URL reason — header).
  previewInvite: multiHumanProcedure.input(previewInviteSchema).mutation(({ ctx, input }) => ctx.services.chat.previewInvite({ principal: ctx.auth, input })),

  // THE one human-join path (the atomic participant-insert chokepoint).
  redeemInvite: multiHumanProcedure.input(redeemInviteSchema).mutation(({ ctx, input }) => ctx.services.chat.redeemInvite({ principal: ctx.auth, input })),

  // The token-FREE in-app accept of a TARGETED invite by id (the notification→accept loop) — self-authorizing
  // (the invite is bound to `ctx.auth.userId`); a share-link / foreign / spent invite is a leak-free NOT_FOUND.
  acceptInvite: multiHumanProcedure
    .input(acceptInviteSchema)
    .mutation(({ ctx, input }) => ctx.services.chat.acceptInvite({ principal: ctx.auth, inviteId: input.inviteId })),

  revokeInvite: multiHumanProcedure.input(revokeSchema).mutation(({ ctx, input }) => ctx.services.chat.revokeInvite({ principal: ctx.auth, ...input })),

  // FIX #4 — the host-management outstanding-invites read (`InviteView`s; tokens never re-derivable).
  // A genuine `.query()`: unlike preview/redeem there is no raw token in the input or output, so the
  // token-in-URL transport concern (file header) does not apply. Host authority lives INSIDE the verb.
  listInvites: multiHumanProcedure
    .input(chatScopedSchema)
    .query(({ ctx, input }) => ctx.services.chat.listInvites({ principal: ctx.auth, chatId: input.chatId })),

  declineInvite: multiHumanProcedure
    .input(declineSchema)
    .mutation(({ ctx, input }) => ctx.services.chat.declineInvite({ principal: ctx.auth, inviteId: input.inviteId })),

  // Host removes a HUMAN member (character mute/remove is the ungated chat surface, not here).
  kick: multiHumanProcedure.input(kickSchema).mutation(({ ctx, input }) => ctx.services.chat.kick({ principal: ctx.auth, ...input })),

  // Host sets how much of the room's canon one HUMAN member may read (D16). The change takes effect on the
  // target's very NEXT read — the floor is resolved per-call from this column, never cached in a session.
  setMemberHistoryVisibility: multiHumanProcedure
    .input(setMemberHistoryVisibilitySchema)
    .mutation(({ ctx, input }) => ctx.services.chat.setMemberHistoryVisibility({ principal: ctx.auth, ...input })),

  selfLeave: multiHumanProcedure
    .input(chatScopedSchema)
    .mutation(({ ctx, input }) => ctx.services.chat.selfLeave({ principal: ctx.auth, chatId: input.chatId })),

  nominateHostHandoff: multiHumanProcedure
    .input(nominateSchema)
    .mutation(({ ctx, input }) => ctx.services.chat.nominateHostHandoff({ principal: ctx.auth, ...input })),

  acceptHostHandoff: multiHumanProcedure
    .input(chatScopedSchema)
    .mutation(({ ctx, input }) => ctx.services.chat.acceptHostHandoff({ principal: ctx.auth, chatId: input.chatId })),
});
