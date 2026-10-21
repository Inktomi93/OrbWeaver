// domain/chat/guard — THE membership chokepoint (spine §2a/§7.1). The
// ONE place a chatId surface loads its membership and routes the authority decision through the substrate
// deciders. Chat verbs call these typed gates directly. The multiplexed chat stream reuses member-gated
// `ChatService` reads at attach/replay and on every live yield; it does not maintain a string-keyed parallel
// authority classifier.
//
// HOMED at the feature root (the `domain/admin/guard.ts` precedent — the auth guard is a feature-root file,
// not a verb): it is the I/O wrapper (it calls `persistence/loadMemberChat`), so it cannot live in
// `substrate/` (zero-I/O). Feature-root files are exempt from the substrate-below-verbs / subsystem-seam
// rules, and a domain root file may reach `persistence/` + `substrate/` directly.
//
// RESOLVED: the DECISION routes through the injected `can()` seam (`substrate/auth/decide`). This guard
// LOADS the caller's membership (`loadMemberChat` — chat's own data) and feeds the roster to `ctx.can`; the
// `role === 'host'` verdict lives in admin's `can()`, never here (spine #6). `can` is injected on `ChatContext`
// (wired at the entry composition root) — chat NEVER imports admin (`domain-no-cross-feature`).

import type { HistoryFloorSeq } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { ChatId } from "@orb/kit/ids";
import type { ChatContext } from "./context.ts";
import { CHAT_OP_CODES, ChatNotFoundError, ChatOperationError } from "./contract/errors.ts";
import type { HandoffAcceptance } from "./contract/handoff-barrier.ts";
import type { ParticipantRow } from "./contract/participant-row.ts";
import { loadHandoffResumption } from "./persistence/handoff-resume.ts";
import { loadMemberChat, loadPendingHandoff } from "./persistence/queries.ts";
import { assertAuthorOrHost, assertHost, assertParticipant, resolveHistoryFloorSeq } from "./substrate/auth/index.ts";
import { hostSeatOf } from "./substrate/participants-host.ts";

/** The chokepoint's deps: the DB read (`loadMemberChat`) + the injected `can()` decision seam. */
type GuardCtx = Pick<ChatContext, "db" | "can">;

/** The loaded present-membership (the `loadMemberChat` hit) — the chat row + the caller's `host|member`
 *  role + their own join horizon. Reuses the persistence query's inferred return (the `provision-identity`
 *  `ExistingUser` pattern); the row shape stays file-local to `persistence/queries` (callers destructure). */
type MemberChat = NonNullable<Awaited<ReturnType<typeof loadMemberChat>>>;

/** The gated membership every chat surface receives: the loaded row PLUS the caller's resolved D16 canon
 *  read floor. Stamped once, HERE, so no read path re-derives (or forgets) the policy. */
type GatedMembership = MemberChat & { readonly historyFloorSeq: HistoryFloorSeq };

/**
 * Present-membership gate — read/stream/post/turn-run (→ `member`). Loads the caller's PRESENT
 * `chat_participants` row; a miss (no chat OR not a present member) throws a leak-free `ChatNotFoundError`.
 * Returns the loaded membership so the verb reuses it (no second query — the turn loads it anyway).
 *
 * It ALSO resolves the caller's D16 `joinHistoryVisibility` floor (`substrate/auth::resolveHistoryFloorSeq`)
 * onto the returned membership as `historyFloorSeq`. This is the ONE place participation is resolved, so it
 * is the ONE place the floor is derived: every surface that can hand back historical canon reads it from
 * here (`listMessages`, the durable bus replay, the SSE token-log replay, the fork copy, the compaction
 * checkpoint) rather than re-reading the participant row. Per-CALLER by construction — the row loaded is the
 * caller's own, so a host is never clamped by another member's floor.
 */
export async function requireParticipant(ctx: GuardCtx, principal: Principal, chatId: ChatId): Promise<GatedMembership> {
  const membership = assertParticipant(await loadMemberChat(ctx.db, chatId, principal.userId), chatId);
  // Route the read-floor through the ONE seam (spine §6). A present member always reads in v1 — this is the
  // seam where a future `observer` participant kind denies; the verdict lives in `can()`, never here.
  ctx.can(principal, "read", { kind: "chat", membership: { role: membership.role } });
  return { ...membership, historyFloorSeq: resolveHistoryFloorSeq(membership) };
}

/**
 * Host-authority gate — room config / roster / lifecycle mutation (→ `host`). A non-member
 * throws `ChatNotFoundError` (leak-free); a member who is not the host throws `ChatOperationError('not_host')`
 * (a known-existence authority refusal, per `contract/errors.ts`).
 */
export async function requireHost(ctx: GuardCtx, principal: Principal, chatId: ChatId): Promise<GatedMembership> {
  const membership = await requireParticipant(ctx, principal, chatId);
  assertHost(ctx.can, principal, membership.role, chatId);
  return membership;
}

/** The same nominee/resumption authority gates both admission and the actual transfer. */
export async function requireHandoffAcceptance(ctx: GuardCtx, principal: Principal, chatId: ChatId): Promise<HandoffAcceptance> {
  await requireParticipant(ctx, principal, chatId);
  const resumable = await loadHandoffResumption(ctx.db, chatId);
  if (resumable !== null) {
    if (resumable.acceptedByUserId !== principal.userId) {
      throw new ChatOperationError(CHAT_OP_CODES.notTurnOwner, `chat ${chatId}: only the accepted host may resume the host handoff`);
    }
    return { kind: "resume", resumption: resumable };
  }
  const { pendingHostUserId, offer } = await loadPendingHandoff(ctx.db, chatId);
  if (pendingHostUserId === null || pendingHostUserId !== principal.userId) {
    throw new ChatOperationError(CHAT_OP_CODES.notTurnOwner, `chat ${chatId}: only the nominated member may accept the host handoff`);
  }
  return { kind: "pending", offer };
}

/**
 * Author-or-host gate — edit/delete a slot (→ `author-or-host`). The host overrides any slot;
 * otherwise the caller must be the slot's `authorUserId`. The verb supplies the slot author (read from the
 * `messages` row it is editing).
 */
export async function requireAuthorOrHost(
  ctx: GuardCtx,
  principal: Principal,
  chatId: ChatId,
  authorUserId: Principal["userId"] | null,
): Promise<GatedMembership> {
  const membership = await requireParticipant(ctx, principal, chatId);
  assertAuthorOrHost(ctx.can, { principal, role: membership.role, authorUserId }, chatId);
  return membership;
}

/**
 * Lineage gate — fork/export/corpus ancestry (→ `lineage-per-ancestor`). Each ancestor is
 * gated INDEPENDENTLY (a fork grants NO parent membership): returns the ancestors the caller is a present
 * member of. A non-member ancestor is EXCLUDED, not an error — the chain legitimately spans chats the caller
 * cannot see (the walker redacts; it does not leak their existence).
 */
export async function gateLineagePerAncestor(ctx: GuardCtx, principal: Principal, ancestorChatIds: readonly ChatId[]): Promise<ChatId[]> {
  const memberships = await Promise.all(ancestorChatIds.map((id) => loadMemberChat(ctx.db, id, principal.userId)));
  return ancestorChatIds.filter((_, i) => memberships[i] !== undefined);
}

/** Entry supplies only the inert connection; membership and floor decisions remain in the private guard. */
export function requireWiredParticipant(ctx: DbAssemblyInput<GuardCtx>, principal: Principal, chatId: ChatId): Promise<GatedMembership> {
  return requireParticipant({ ...ctx, db: databaseForOwner(ctx.db) }, principal, chatId);
}

/** Preserve the same host kernel call after recovering the owner's actual connection. */
export function requireWiredHost(ctx: DbAssemblyInput<GuardCtx>, principal: Principal, chatId: ChatId): Promise<GatedMembership> {
  return requireHost({ ...ctx, db: databaseForOwner(ctx.db) }, principal, chatId);
}

/** The slot author stays caller-supplied; conversion does not decide or cache authority. */
export function requireWiredAuthorOrHost(
  ctx: DbAssemblyInput<GuardCtx>,
  principal: Principal,
  chatId: ChatId,
  authorUserId: Principal["userId"] | null,
): Promise<GatedMembership> {
  return requireAuthorOrHost({ ...ctx, db: databaseForOwner(ctx.db) }, principal, chatId, authorUserId);
}

/** A nominee is a present non-host target; the caller's requireHost gate remains separate. */
export function requireHandoffNominee<T extends Pick<ParticipantRow, "role" | "userId">>(
  participants: readonly T[],
  userId: Principal["userId"],
  chatId: ChatId,
): T {
  const nominee = participants.find((participant) => participant.userId === userId);
  if (nominee === undefined || nominee === hostSeatOf(participants)) {
    throw new ChatNotFoundError(chatId);
  }
  return nominee;
}
