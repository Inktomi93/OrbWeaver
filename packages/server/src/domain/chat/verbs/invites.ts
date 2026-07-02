// domain/chat/verbs/invites — the invite lifecycle + THE one human participant-insert chokepoint (chat.md
// Part I 8-slot `verbs/invites.ts`; Part III §2 invites & the chokepoint, §11 the auth matrix). The token
// mirrors the `sessions` discipline: CSPRNG-minted, returned RAW exactly ONCE (the `/join/:token` link),
// STORED HASHED (the peppered `hashToken`) — lookups key on the hash, the raw token never persists. Redeem is
// the ONE human-join path (the atomic `redeemInviteAtomic` closes the maxUses/expiry TOCTOU; `role` is
// server-forced `member`, `joinSeq` stamped at the canon head; the re-add upsert lives in persistence).
//
// VERB DEPS (the second factory arg) — the two collaborators deliberately NOT on `ChatContext` (PD-61
// resolved: `hashToken` + `newInviteId` moved ONTO ctx as crypto/minter siblings; these two stay deps by
// design):
//   • emit               — the chat bus (chat's OWN in-process collaborator, NOT a ctx op —
//                          FLAG[bus-not-on-ctx] in bus.ts; every emitting bundle takes it as a deps arg).
//   • loadParticipantViews — the roster read-model resolver, built ONCE inside chat's own composition root
//                          (service.ts — chat-internal, shared with fork/read/start-chat; not entry-wired,
//                          so it cannot live on the entry-assembled `ChatContext`).
//
// TARGETED invites (PD-66 cleared): `createInvite` resolves `invitedHandle` through the injected
// `ctx.resolveHandle` (sessions' EXACT handle→userId — chat.md §2: no listing; the probe surface is
// transport-rate-limited). An unknown/disabled handle is a coded `invite_target_unknown` refusal (the
// exact-handle existence answer is inherent to targeting; it is NEVER silently degraded to a share-link).
// The stored `invitedUserId` scopes preview/redeem/decline to the target (already leak-free downstream).
// FLAG[avatar-on-self-view]: the joining caller's `ParticipantView.avatarAssetId` resolves via
// `loadParticipantViews` (root) — see that resolver; the verb does not read personas/assets directly.

import { randomBytes } from "node:crypto";
import type {
  ChatBusEvent,
  GroupConfig,
  InvitePreview,
  InviteView,
  ParticipantView,
} from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG, DEFAULT_ROOM_OVERRIDES } from "@orb/contracts/chat";
import { DomainNotFoundError, DomainOperationError } from "@orb/kit/errors";
import type { ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ChatContext } from "../contract/context";
import { ChatNotFoundError } from "../contract/errors";
import type {
  CreateInviteParams,
  DeclineInviteParams,
  PreviewInviteParams,
  RedeemInviteParams,
  RevokeInviteParams,
} from "../contract/params";
import type { ChatService } from "../contract/service";
import type { ChatDetail } from "../contract/views";
import { requireHost } from "../guard";
import {
  countPresentMembers,
  createInvite as createInvitePersist,
  declineInviteById,
  findInviteByTokenHash,
  redeemInviteAtomic,
  revokeInvite as revokeInvitePersist,
} from "../persistence/invites";
import { loadChatRow, loadMemberChat } from "../persistence/queries";

/** The collaborators the invite verbs close over (see the file header VERB DEPS note). Inlined
 *  + non-exported (the `types-in-contract` gate); the root builds a matching object literal. */
interface InviteDeps {
  readonly emit: (event: ChatBusEvent) => Promise<void>;
  readonly loadParticipantViews: (chatId: ChatId) => Promise<readonly ParticipantView[]>;
}

/** The invite slice of `ChatService` this grouped file owns (the bundle the composition root spreads in). */
type InviteVerbs = Pick<
  ChatService,
  "createInvite" | "previewInvite" | "redeemInvite" | "revokeInvite" | "declineInvite"
>;

/**
 * The invite-lifecycle verb BUNDLE (the grouped-file `create<File>` convention — `verb-naming` gate). Folds
 * the per-verb factories (internal below) into one object keyed by their `ChatService` method names; the
 * composition root spreads it into the full service. `deps` carries the two collaborators deliberately not
 * on `ChatContext` (see the file header).
 */
export function createInvites(ctx: ChatContext, deps: InviteDeps): InviteVerbs {
  return {
    createInvite: createCreateInvite(ctx),
    previewInvite: createPreviewInvite(ctx, deps),
    redeemInvite: createRedeemInvite(ctx, deps),
    revokeInvite: createRevokeInvite(ctx),
    declineInvite: createDeclineInvite(ctx),
  };
}

/** A loaded chat row (the inferred `loadChatRow` return) — named locally so helpers reference it without
 *  re-spelling the file-local `queries.ts` `ChatRow` (the guard.ts `MemberChat` precedent). */
type LoadedChatRow = NonNullable<Awaited<ReturnType<typeof loadChatRow>>>;

/** A 256-bit CSPRNG invite token (≥128-bit per Part III §2; base64url for a URL-safe `/join/:token`). */
const TOKEN_BYTES = 32;

/** A human-readable room-mode label for the invite preview (output × policy) — never the raw config. */
function modeLabel(group: GroupConfig): string {
  return `${group.output} · ${group.policy}`;
}

/** Map a loaded chat row + its resolved roster → the `ChatDetail` read-model (the metadata sub-blobs applied
 *  to their defaults — never raw). The roster `ParticipantView[]` is resolved by the root (FLAG above). */
function toChatDetail(chat: LoadedChatRow, participants: readonly ParticipantView[]): ChatDetail {
  return {
    id: chat.id,
    title: chat.title,
    star: chat.star,
    archived: chat.archived,
    parentChatId: chat.parentChatId,
    forkedAt: chat.forkedAt,
    anchorPersonaId: chat.anchorPersonaId,
    participants,
    group: chat.metadata.group ?? DEFAULT_GROUP_CONFIG,
    roomOverrides: chat.metadata.roomOverrides ?? DEFAULT_ROOM_OVERRIDES,
    opening: chat.metadata.opening ?? null,
    compactSummary: chat.compactSummary,
    compactedAtSeq: chat.compactedAtSeq,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
  };
}

/** `createInvite` — host-only. Mint a CSPRNG token, store its peppered HASH, return the raw token ONCE for
 *  the `/join/:token` link (never raw again; never in an `InviteView`). Share-link by default; a targeted
 *  invite resolves `invitedHandle` → `invitedUserId` (PD-66 — file header). */
function createCreateInvite(ctx: ChatContext): ChatService["createInvite"] {
  return async ({ principal, chatId, input }: CreateInviteParams) => {
    await requireHost(ctx, principal, chatId);
    // PD-66: resolve the exact target handle → userId (sessions' injected resolver; disabled == unknown).
    let invitedUserId: UserId | null = null;
    if (input.invitedHandle !== null && input.invitedHandle !== undefined) {
      invitedUserId = await ctx.resolveHandle(input.invitedHandle);
      if (invitedUserId === null) {
        throw new DomainOperationError(
          "invite_target_unknown",
          "no invitable user with that exact handle",
        );
      }
    }
    const at = ctx.now();
    const token = randomBytes(TOKEN_BYTES).toString("base64url");
    const inviteId = ctx.newInviteId();
    const maxUses = input.maxUses ?? null;
    const expiresAt = input.expiresAt ?? null;
    await createInvitePersist(ctx.db, {
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

/** `previewInvite` — token-authenticated, PRE-membership preview-then-confirm (Part III §2). Returns the
 *  MINIMAL surface (room name / host handle / member count / mode label) — NO roster identities, NO history.
 *  An invalid / expired / exhausted / foreign-targeted token is a leak-free NOT_FOUND. */
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
    const host = participants.find((p) => p.role === "host");
    const memberCount = await countPresentMembers(ctx.db, invite.chatId);
    return {
      chatId: invite.chatId,
      roomName: chat.title ?? "",
      // The host is a human participant → handle resolved; the empty fallback is a defensive floor (FLAG).
      hostHandle: host?.handle ?? castId<Handle>(""),
      memberCount,
      modeLabel: modeLabel(chat.metadata.group ?? DEFAULT_GROUP_CONFIG),
    };
  };
}

/** `redeemInvite` — THE participant-insert chokepoint (Part III §2). Atomic redeem (closes the maxUses/expiry
 *  TOCTOU) → server-forced `member` row at the canon head (the re-add upsert is in persistence) → emit
 *  `chatUpdated`. Idempotent for an already-present member (the upsert no-ops; the verb returns their existing
 *  membership instead of a phantom error). An invalid token is a leak-free NOT_FOUND. */
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
      // `redeemInviteAtomic` returns undefined for an invalid/expired/exhausted invite AND for an
      // already-present member (the upsert no-op). Recover the already-member case idempotently; otherwise
      // it is a genuine invalid-invite NOT_FOUND.
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
    return { chat: toChatDetail(chat, participants), participant };
  };
}

/** `revokeInvite` — host-only. Invalidate a still-pending invite (atomic; idempotent on an already-closed
 *  invite). Host-management surface — no room-public bus event (invites aren't in the member chat detail). */
function createRevokeInvite(ctx: ChatContext): ChatService["revokeInvite"] {
  return async ({ principal, chatId, inviteId }: RevokeInviteParams): Promise<void> => {
    await requireHost(ctx, principal, chatId);
    await revokeInvitePersist(ctx.db, inviteId, chatId);
  };
}

/** `declineInvite` — the invited user declines a TARGETED invite they were notified about (keyed by
 *  `inviteId`, not the raw token — Part III §2). Atomic + scoped to the caller as the target (a foreign /
 *  non-targeted invite never matches — leak-free, idempotent) via `persistence/invites.declineInviteById`
 *  (PD-67 — the inline write extracted to the persistence layer). */
function createDeclineInvite(ctx: ChatContext): ChatService["declineInvite"] {
  return async ({ principal, inviteId }: DeclineInviteParams): Promise<void> => {
    await declineInviteById(ctx.db, inviteId, principal.userId);
  };
}
