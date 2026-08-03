// domain/chat/verbs/invites — the invite lifecycle + the one human participant-insert chokepoint. The
// token mirrors the `sessions` discipline: CSPRNG-minted, returned raw exactly once, stored hashed —
// lookups key on the hash, the raw token never persists. Redeem is the one human-join path (the atomic
// `redeemInviteAtomic` closes the maxUses/expiry TOCTOU; `role` is server-forced `member`).
//
// Verb deps: `emit` is the chat bus (not a ctx op); `loadParticipantViews` is the roster read-model
// resolver built once inside chat's own composition root.
//
// Targeted invites: `createInvite` resolves `invitedHandle` through the injected `ctx.resolveHandle`
// (exact handle→userId, no listing). An unknown/disabled handle is a coded `invite_target_unknown`
// refusal, never silently degraded to a share-link.

import { randomBytes } from "node:crypto";
import type { ChatBusEvent, GroupConfig, InvitePreview, InviteView, ParticipantView } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";

import { DomainNotFoundError, DomainOperationError } from "@orb/kit/errors";
import type { ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ChatContext } from "../context.ts";
import { ChatNotFoundError } from "../contract/errors.ts";
import type {
  AcceptInviteParams,
  CreateInviteParams,
  DeclineInviteParams,
  ListInvitesParams,
  PreviewInviteParams,
  RedeemInviteParams,
  RevokeInviteParams,
} from "../contract/params.ts";
import type { ChatService } from "../contract/service.ts";
import { requireHost } from "../guard.ts";
import {
  acceptInviteByIdAtomic,
  countPresentMembers,
  declineInviteById,
  findInviteById,
  findInviteByTokenHash,
  insertInvite,
  listInvitesForChat,
  redeemInviteAtomic,
  revokeInviteById,
} from "../persistence/invites.ts";
import { loadChatMacroNameProducer } from "../persistence/macro-names.ts";
import { loadChatRow, loadMemberChat } from "../persistence/queries.ts";
import { loadCharacterAvatarProducer, loadPersonaAvatarProducer } from "../persistence/roster-avatars.ts";
import { resolveHistoryFloorSeq } from "../substrate/auth/index.ts";
import { toChatDetail } from "../substrate/chat-detail.ts";
import { hostSeatOf } from "../substrate/roster-host.ts";

/** The collaborators the invite verbs close over (see the file header). */
interface InviteDeps {
  readonly emit: (event: ChatBusEvent) => Promise<void>;
  readonly loadParticipantViews: (chatId: ChatId) => Promise<readonly ParticipantView[]>;
}

/** The invite slice of `ChatService` this grouped file owns. */
type InviteVerbs = Pick<ChatService, "createInvite" | "previewInvite" | "redeemInvite" | "acceptInvite" | "revokeInvite" | "declineInvite" | "listInvites">;

/** The invite-lifecycle verb bundle. `deps` carries the two collaborators deliberately not on `ChatContext`. */
export function createInvites(ctx: ChatContext, deps: InviteDeps): InviteVerbs {
  return {
    createInvite: createCreateInvite(ctx),
    previewInvite: createPreviewInvite(ctx, deps),
    redeemInvite: createRedeemInvite(ctx, deps),
    acceptInvite: createAcceptInvite(ctx, deps),
    revokeInvite: createRevokeInvite(ctx),
    declineInvite: createDeclineInvite(ctx),
    listInvites: createListInvites(ctx),
  };
}

/** A 256-bit CSPRNG invite token, base64url for a URL-safe `/join/:token`. */
const TOKEN_BYTES = 32;

/** A human-readable room-mode label for the invite preview (output × policy) — never the raw config. */
function modeLabel(group: GroupConfig): string {
  return `${group.output} · ${group.policy}`;
}

/** `createInvite` — host-only. Mint a CSPRNG token, store its peppered hash, return the raw token once for
 *  the `/join/:token` link. Share-link by default; a targeted invite resolves `invitedHandle` →
 *  `invitedUserId`.
 *
 *  A targeted invite additionally delivers the durable `invite` notification (the per-user inbox the
 *  per-chat bus can't reach — the invitee isn't a member yet). Fired after persist; carries `inviteId`,
 *  never the raw token. A share-link invite has no single recipient to notify — skipped. */
function createCreateInvite(ctx: ChatContext): ChatService["createInvite"] {
  return async ({ principal, chatId, input }: CreateInviteParams) => {
    await requireHost(ctx, principal, chatId);
    // Resolve the exact target handle → userId (sessions' injected resolver; disabled == unknown).
    let invitedUserId: UserId | null = null;
    if (input.invitedHandle !== null && input.invitedHandle !== undefined) {
      // Invites are the human membership chokepoint — an agent enters a room only via `seatAgent`, never
      // an invite.
      invitedUserId = await ctx.resolveHandle(input.invitedHandle);
      if (invitedUserId === null) {
        throw new DomainOperationError("invite_target_unknown", "no invitable user with that exact handle");
      }
    }
    const at = ctx.now();
    const token = randomBytes(TOKEN_BYTES).toString("base64url");
    const inviteId = ctx.newInviteId();
    const maxUses = input.maxUses ?? null;
    const expiresAt = input.expiresAt ?? null;
    await insertInvite(ctx.db, {
      id: inviteId,
      chatId,
      tokenHash: ctx.hashToken(token),
      maxUses,
      uses: 0,
      expiresAt,
      invitedUserId,
      status: "pending",
      createdAt: at,
    });
    // A targeted invite delivers the durable `invite` notification after the persist above commits — a
    // share-link invite has nobody to notify.
    if (invitedUserId !== null) {
      await ctx.emitNotification({
        type: "invite",
        recipientUserId: invitedUserId,
        chatId,
        inviteId,
        invitedByHandle: principal.handle,
      });
    }
    const invite: InviteView = {
      id: inviteId,
      chatId,
      status: "pending",
      maxUses,
      remainingUses: maxUses, // uses = 0 at creation
      expiresAt,
      invitedUserId,
      createdAt: at,
    };
    return { invite, token };
  };
}

/** `previewInvite` — token-authenticated, pre-membership preview-then-confirm. Returns the minimal
 *  surface — no roster identities, no history. An invalid/expired/exhausted/foreign-targeted token is a
 *  leak-free NOT_FOUND. */
function createPreviewInvite(ctx: ChatContext, deps: InviteDeps): ChatService["previewInvite"] {
  return async ({ principal, input }: PreviewInviteParams): Promise<InvitePreview> => {
    const at = ctx.now();
    const invite = await findInviteByTokenHash(ctx.db, ctx.hashToken(input.token));
    const usable =
      invite !== undefined &&
      invite.status === "pending" &&
      (invite.expiresAt === null || invite.expiresAt > at) &&
      (invite.maxUses === null || invite.uses < invite.maxUses) &&
      // A targeted invite is previewable only by its target (leak-free for everyone else).
      (invite.invitedUserId === null || invite.invitedUserId === principal.userId);
    if (invite === undefined || !usable) {
      throw new DomainNotFoundError("invite", "");
    }
    const chat = await loadChatRow(ctx.db, invite.chatId);
    if (chat === undefined) {
      throw new DomainNotFoundError("invite", "");
    }
    const participants = await deps.loadParticipantViews(invite.chatId);
    const host = hostSeatOf(participants);
    const memberCount = await countPresentMembers(ctx.db, invite.chatId);
    return {
      chatId: invite.chatId,
      roomName: chat.title ?? "",
      // The host is a human participant → handle resolved; the empty fallback is a defensive floor.
      hostHandle: host?.handle ?? castId<Handle>(""),
      memberCount,
      modeLabel: modeLabel(chat.metadata.group ?? DEFAULT_GROUP_CONFIG),
    };
  };
}

/** `redeemInvite` — the participant-insert chokepoint. Atomic redeem (closes the maxUses/expiry TOCTOU)
 *  → server-forced `member` row → emit `chatUpdated`. Idempotent for an already-present member. An invalid
 *  token is a leak-free NOT_FOUND. */
function createRedeemInvite(ctx: ChatContext, deps: InviteDeps): ChatService["redeemInvite"] {
  return async ({ principal, input }: RedeemInviteParams) => {
    const tokenHash = ctx.hashToken(input.token);
    const at = ctx.now();
    const result = await redeemInviteAtomic(ctx.db, {
      tokenHash,
      userId: principal.userId,
      participantId: ctx.newParticipantId(),
      now: at,
    });

    let chatId: ChatId;
    if (result !== undefined) {
      chatId = result.chatId;
      await deps.emit({ type: "chatUpdated", chatId });
    } else {
      // `redeemInviteAtomic` returns undefined for an invalid/expired/exhausted/foreign-targeted invite
      // AND for an already-present member. The already-member case recovers below; otherwise NOT_FOUND.
      const invite = await findInviteByTokenHash(ctx.db, tokenHash);
      if (invite === undefined) {
        throw new DomainNotFoundError("invite", "");
      }
      const existing = await loadMemberChat(ctx.db, invite.chatId, principal.userId);
      if (existing === undefined) {
        throw new DomainNotFoundError("invite", "");
      }
      chatId = invite.chatId;
    }

    const chat = await loadChatRow(ctx.db, chatId);
    if (chat === undefined) {
      throw new ChatNotFoundError(chatId);
    }
    const participants = await deps.loadParticipantViews(chatId);
    const participant = participants.find((p) => p.userId === principal.userId);
    if (participant === undefined) {
      throw new ChatNotFoundError(chatId);
    }
    const macroNames = await loadChatMacroNameProducer(ctx.db, { participants });
    const personaAvatars = await loadPersonaAvatarProducer(ctx.db, { participants });
    const characterAvatars = await loadCharacterAvatarProducer(ctx.db, { participants });
    return {
      chat: toChatDetail({
        chat,
        participants,
        macroNames,
        personaAvatars,
        characterAvatars,
        viewerUserId: principal.userId,
        // The joiner's OWN D16 floor, off the row the redeem just wrote — a `from-join` joiner must not
        // receive the compaction checkpoint (a distillation of the canon their floor withholds) on the very
        // response that seats them.
        viewerHistoryFloorSeq: resolveHistoryFloorSeq(participant),
      }),
      participant,
    };
  };
}

/** `acceptInvite` — the token-free in-app accept of a targeted invite by id. Self-authorizing: the caller's
 *  authenticated `principal.userId` is the authorization — the atomic `acceptInviteByIdAtomic` demands an
 *  exact `invitedUserId === caller` match. Every failure collapses to the same leak-free NOT_FOUND. On
 *  success: the same atomic seat as redeem → emit `chatUpdated`. Idempotent for an already-present member. */
function createAcceptInvite(ctx: ChatContext, deps: InviteDeps): ChatService["acceptInvite"] {
  return async ({ principal, inviteId }: AcceptInviteParams) => {
    const at = ctx.now();
    const result = await acceptInviteByIdAtomic(ctx.db, {
      inviteId,
      userId: principal.userId,
      participantId: ctx.newParticipantId(),
      now: at,
    });

    let chatId: ChatId;
    if (result !== undefined) {
      chatId = result.chatId;
      await deps.emit({ type: "chatUpdated", chatId });
    } else {
      // The atomic returns undefined for an invalid/foreign/expired/exhausted/declined/revoked/share-link
      // invite AND for an already-present member. Recover only the already-member case, gated on the
      // bound target, so a non-target's probe leaks nothing.
      const invite = await findInviteById(ctx.db, inviteId);
      if (invite === undefined || invite.invitedUserId !== principal.userId) {
        throw new DomainNotFoundError("invite", "");
      }
      const existing = await loadMemberChat(ctx.db, invite.chatId, principal.userId);
      if (existing === undefined) {
        throw new DomainNotFoundError("invite", "");
      }
      chatId = invite.chatId;
    }

    const chat = await loadChatRow(ctx.db, chatId);
    if (chat === undefined) {
      throw new ChatNotFoundError(chatId);
    }
    const participants = await deps.loadParticipantViews(chatId);
    const participant = participants.find((p) => p.userId === principal.userId);
    if (participant === undefined) {
      throw new ChatNotFoundError(chatId);
    }
    const macroNames = await loadChatMacroNameProducer(ctx.db, { participants });
    const personaAvatars = await loadPersonaAvatarProducer(ctx.db, { participants });
    const characterAvatars = await loadCharacterAvatarProducer(ctx.db, { participants });
    return {
      chat: toChatDetail({
        chat,
        participants,
        macroNames,
        personaAvatars,
        characterAvatars,
        viewerUserId: principal.userId,
        // The joiner's OWN D16 floor, off the row the redeem just wrote — a `from-join` joiner must not
        // receive the compaction checkpoint (a distillation of the canon their floor withholds) on the very
        // response that seats them.
        viewerHistoryFloorSeq: resolveHistoryFloorSeq(participant),
      }),
      participant,
    };
  };
}

/** `listInvites` — host-only: the host-management outstanding-invites read, newest-first. Maps
 *  persistence rows → `InviteView`s, computing `remainingUses` (`maxUses - uses`, floored at 0; null =
 *  unlimited); the peppered `tokenHash` never leaves persistence. */
function createListInvites(ctx: ChatContext): ChatService["listInvites"] {
  return async ({ principal, chatId }: ListInvitesParams): Promise<readonly InviteView[]> => {
    await requireHost(ctx, principal, chatId);
    const rows = await listInvitesForChat(ctx.db, chatId);
    return rows.map((row) => ({
      id: row.id,
      chatId: row.chatId,
      status: row.status,
      maxUses: row.maxUses,
      remainingUses: row.maxUses === null ? null : Math.max(0, row.maxUses - row.uses),
      expiresAt: row.expiresAt,
      invitedUserId: row.invitedUserId,
      createdAt: row.createdAt,
    }));
  };
}

/** `revokeInvite` — host-only. Invalidate a still-pending invite (atomic; idempotent on an already-closed
 *  invite). Host-management surface — no room-public bus event (invites aren't in the member chat detail). */
function createRevokeInvite(ctx: ChatContext): ChatService["revokeInvite"] {
  return async ({ principal, chatId, inviteId }: RevokeInviteParams): Promise<void> => {
    await requireHost(ctx, principal, chatId);
    await revokeInviteById(ctx.db, inviteId, chatId);
  };
}

/** `declineInvite` — the invited user declines a targeted invite they were notified about (keyed by
 *  `inviteId`, not the raw token). Atomic + scoped to the caller as the target — a foreign/non-targeted
 *  invite never matches, leak-free and idempotent. */
function createDeclineInvite(ctx: ChatContext): ChatService["declineInvite"] {
  return async ({ principal, inviteId }: DeclineInviteParams): Promise<void> => {
    await declineInviteById(ctx.db, inviteId, principal.userId);
  };
}
