// domain/chat/verbs/invites — the invite lifecycle + THE one human participant-insert chokepoint. The token
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
// `ctx.resolveHandle` (sessions' EXACT handle→userId — no listing; the probe surface is
// transport-rate-limited). An unknown/disabled handle is a coded `invite_target_unknown` refusal (the
// exact-handle existence answer is inherent to targeting; it is NEVER silently degraded to a share-link).
// The stored `invitedUserId` scopes preview/redeem/decline to the target (already leak-free downstream).
// FLAG[avatar-on-self-view]: the joining caller's `ParticipantView.avatarAssetId` resolves via
// `loadParticipantViews` (root) — see that resolver; the verb does not read personas/assets directly.

import { randomBytes } from "node:crypto";
import type {
  ChatBusEvent,
  ChatMacroNameProducer,
  GroupConfig,
  InvitePreview,
  InviteView,
  ParticipantView,
  PersonaAvatarEntry,
} from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG, DEFAULT_ROOM_OVERRIDES } from "@orb/contracts/chat";
import { isReservedAgentHandle } from "@orb/contracts/identity";
import { DomainNotFoundError, DomainOperationError } from "@orb/kit/errors";
import type { ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ChatContext } from "../contract/context";
import { ChatNotFoundError } from "../contract/errors";
import type {
  AcceptInviteParams,
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
  acceptInviteByIdAtomic,
  countPresentMembers,
  createInvite as createInvitePersist,
  declineInviteById,
  findInviteById,
  findInviteByTokenHash,
  redeemInviteAtomic,
  revokeInvite as revokeInvitePersist,
} from "../persistence/invites";
import { loadChatMacroNameProducer } from "../persistence/macro-names";
import { loadChatRow, loadMemberChat } from "../persistence/queries";
import { loadPersonaAvatarProducer } from "../persistence/roster-avatars";

/** The collaborators the invite verbs close over (see the file header VERB DEPS note). Inlined
 *  + non-exported (the `types-in-contract` gate); the root builds a matching object literal. */
interface InviteDeps {
  readonly emit: (event: ChatBusEvent) => Promise<void>;
  readonly loadParticipantViews: (chatId: ChatId) => Promise<readonly ParticipantView[]>;
}

/** The invite slice of `ChatService` this grouped file owns (the bundle the composition root spreads in). */
type InviteVerbs = Pick<
  ChatService,
  | "createInvite"
  | "previewInvite"
  | "redeemInvite"
  | "acceptInvite"
  | "revokeInvite"
  | "declineInvite"
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
    acceptInvite: createAcceptInvite(ctx, deps),
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

/** Map a loaded chat row + its resolved roster + macro name producer → the `ChatDetail` read-model (the
 *  metadata sub-blobs applied to their defaults — never raw; the same projection `read.ts`/`fork.ts`/
 *  `start-chat.ts` use). The roster `ParticipantView[]` is resolved by the root (FLAG above). */
interface ToChatDetailInput {
  readonly chat: LoadedChatRow;
  readonly participants: readonly ParticipantView[];
  readonly macroNames: ChatMacroNameProducer;
  readonly personaAvatars: readonly PersonaAvatarEntry[];
  readonly viewerUserId: UserId;
}

function toChatDetail({
  chat,
  participants,
  macroNames,
  personaAvatars,
  viewerUserId,
}: ToChatDetailInput): ChatDetail {
  const viewer = participants.find((p) => p.userId === viewerUserId);
  return {
    id: chat.id,
    title: chat.title,
    star: chat.star,
    archived: chat.archived,
    parentChatId: chat.parentChatId,
    forkedAt: chat.forkedAt,
    anchorPersonaId: chat.anchorPersonaId,
    participants,
    viewerActivePersonaId: viewer?.activePersonaId ?? null,
    viewerIsHost: viewer?.role === "host",
    viewerUserId,
    group: chat.metadata.group ?? DEFAULT_GROUP_CONFIG,
    roomOverrides: chat.metadata.roomOverrides ?? DEFAULT_ROOM_OVERRIDES,
    opening: chat.metadata.opening ?? null,
    compactSummary: chat.compactSummary,
    compactedAtSeq: chat.compactedAtSeq,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    macroNames,
    personaAvatars,
  };
}

/** `createInvite` — host-only. Mint a CSPRNG token, store its peppered HASH, return the raw token ONCE for
 *  the `/join/:token` link (never raw again; never in an `InviteView`). Share-link by default; a targeted
 *  invite resolves `invitedHandle` → `invitedUserId` (PD-66 — file header).
 *
 *  PD-105: a TARGETED invite additionally delivers the durable `invite` notification (the per-user inbox
 *  the per-chat bus can't reach — the invitee isn't a member yet, so there's no room to fan a bus event
 *  into). Fired AFTER persist (`ctx.emitNotification`, the ONE write chokepoint every producer inherits —
 *  `notifications.record`). The event carries `inviteId` (the decline/preview-by-id handle), NEVER the raw
 *  token — the schema makes that type-level unrepresentable (accept stays token-authenticated via the
 *  `/join/:token` link the host shares out-of-band; the notification's `inviteId` only backs `declineInvite`,
 *  which is genuinely inviteId-keyed). A share-link invite (a null `invitedUserId`) has no single recipient
 *  to notify — skipped, matching `recipientUserId`'s mandatory-field schema. */
function createCreateInvite(ctx: ChatContext): ChatService["createInvite"] {
  return async ({ principal, chatId, input }: CreateInviteParams) => {
    await requireHost(ctx, principal, chatId);
    // PD-66: resolve the exact target handle → userId (sessions' injected resolver; disabled == unknown).
    let invitedUserId: UserId | null = null;
    if (input.invitedHandle !== null && input.invitedHandle !== undefined) {
      // D60 (agent-principal-design/06 §4): invites are the HUMAN membership chokepoint — an agent enters a
      // room only via `seatAgent` (AP3), NEVER an invite. Refuse the reserved `__agent__` namespace at the
      // boundary (the one-homed predicate, reused), leak-free as "no invitable user" (never confirm the
      // namespace exists). FLAG[PD-17].
      if (isReservedAgentHandle(input.invitedHandle)) {
        throw new DomainOperationError(
          "invite_target_unknown",
          "no invitable user with that exact handle",
        );
      }
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
    // PD-105: a targeted invite delivers the durable `invite` notification AFTER the persist above commits —
    // a share-link invite (no single `invitedUserId`) has nobody to notify.
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
      // `redeemInviteAtomic` returns undefined for an invalid/expired/exhausted/FOREIGN-TARGETED invite AND
      // for an already-present member (the upsert no-op). The already-member case is recovered idempotently
      // below — otherwise it is a genuine not-redeemable NOT_FOUND. A non-target has no membership to recover,
      // so a targeted invite that reached the wrong user is indistinguishable from an invalid token.
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
    return {
      chat: toChatDetail({
        chat,
        participants,
        macroNames,
        personaAvatars,
        viewerUserId: principal.userId,
      }),
      participant,
    };
  };
}

/** `acceptInvite` — the token-free in-app accept of a TARGETED invite by id (the notification→accept loop —
 *  closes it with no raw token leaving the app). SELF-AUTHORIZING: the caller's authenticated `principal.userId`
 *  IS the authorization — the atomic `acceptInviteByIdAtomic` demands an EXACT `invitedUserId === caller` match
 *  (a share-link invite is token-only → not acceptable by id; a foreign targeted invite is never confirmed).
 *  Every failure — invalid id / foreign / expired / exhausted / declined / revoked / share-link — collapses to
 *  the SAME leak-free NOT_FOUND (no oracle). On success: the same atomic seat as redeem (server-forced `member`
 *  at the canon head, use burned, TOCTOU closed) → emit `chatUpdated`. Idempotent for an already-present member
 *  (recover their existing membership, not a phantom error), keyed by id + gated on the target match so the
 *  recovery path leaks nothing to a non-target. Returns `{ chat, participant }` — identical to `redeemInvite`. */
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
      // The atomic returns undefined for an invalid/foreign/expired/exhausted/declined/revoked/share-link invite
      // AND for an already-present member (the seat no-op). Recover ONLY the already-member case — and ONLY for
      // the bound target (`invitedUserId === caller`), so a non-target's probe leaks nothing: a foreign invite
      // fails the target check exactly as a missing one does (both NOT_FOUND). A non-member has no membership to
      // recover, so a not-yet-acceptable targeted invite is indistinguishable from an invalid id.
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
    return {
      chat: toChatDetail({
        chat,
        participants,
        macroNames,
        personaAvatars,
        viewerUserId: principal.userId,
      }),
      participant,
    };
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
