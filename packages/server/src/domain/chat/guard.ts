// domain/chat/guard — THE membership chokepoint (spine §2a/§7.1). The
// ONE place a chatId surface loads its membership and routes the authority decision through the substrate
// deciders. Every chatId verb + the non-verb surfaces (SSE subscribe, bus delivery, lineage walk, …) gate
// HERE; an unlisted surface is default-deny (`substrate/auth/matrix`).
//
// HOMED at the feature root (the `domain/admin/guard.ts` precedent — the auth guard is a feature-root file,
// not a verb): it is the I/O wrapper (it calls `persistence/loadMemberChat`), so it cannot live in
// `substrate/` (zero-I/O). Feature-root files are exempt from the substrate-below-verbs / subsystem-seam
// rules, and a domain root file may reach `persistence/` + `substrate/` directly.
//
// PD-1 — RESOLVED: the DECISION routes through the injected `can()` seam (`substrate/auth/decide`). This guard
// LOADS the caller's membership (`loadMemberChat` — chat's own data) and feeds the roster to `ctx.can`; the
// `role === 'host'` verdict lives in admin's `can()`, never here (spine #6). `can` is injected on `ChatContext`
// (wired at the entry composition root) — chat NEVER imports admin (`domain-no-cross-feature`).

import type { Principal } from "@orb/contracts/identity";
import type { ChatId } from "@orb/kit/ids";
import type { ChatContext } from "./context";
import { loadMemberChat } from "./persistence/queries";
import { assertAuthorOrHost, assertHost, assertParticipant } from "./substrate/auth";

/** The chokepoint's deps: the DB read (`loadMemberChat`) + the injected `can()` decision seam. */
type GuardCtx = Pick<ChatContext, "db" | "can">;

/** The loaded present-membership (the `loadMemberChat` hit) — the chat row + the caller's `host|member`
 *  role. Reuses the persistence query's inferred return (the `provision-identity` `ExistingUser` pattern);
 *  the row shape stays file-local to `persistence/queries` (callers destructure `{ chat, role }`). */
type MemberChat = NonNullable<Awaited<ReturnType<typeof loadMemberChat>>>;

/**
 * Present-membership gate — read/stream/post/turn-run (→ `member`). Loads the caller's PRESENT
 * `chat_participants` row; a miss (no chat OR not a present member) throws a leak-free `ChatNotFoundError`.
 * Returns the loaded membership so the verb reuses it (no second query — the turn loads it anyway).
 */
export async function requireParticipant(
  ctx: GuardCtx,
  principal: Principal,
  chatId: ChatId,
): Promise<MemberChat> {
  const membership = assertParticipant(
    await loadMemberChat(ctx.db, chatId, principal.userId),
    chatId,
  );
  // Route the read-floor through the ONE seam (spine §6). A present member always reads in v1 — this is the
  // seam where a future `observer` participant kind denies; the verdict lives in `can()`, never here.
  ctx.can(principal, "read", { kind: "chat", roster: { role: membership.role } });
  return membership;
}

/**
 * Host-authority gate — room config / roster / lifecycle mutation (→ `host`). A non-member
 * throws `ChatNotFoundError` (leak-free); a member who is not the host throws `ChatOperationError('not_host')`
 * (a known-existence authority refusal, per `contract/errors.ts`).
 */
export async function requireHost(
  ctx: GuardCtx,
  principal: Principal,
  chatId: ChatId,
): Promise<MemberChat> {
  const membership = await requireParticipant(ctx, principal, chatId);
  assertHost(ctx.can, principal, membership.role, chatId);
  return membership;
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
): Promise<MemberChat> {
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
export async function gateLineagePerAncestor(
  ctx: GuardCtx,
  principal: Principal,
  ancestorChatIds: readonly ChatId[],
): Promise<ChatId[]> {
  const memberships = await Promise.all(
    ancestorChatIds.map((id) => loadMemberChat(ctx.db, id, principal.userId)),
  );
  return ancestorChatIds.filter((_, i) => memberships[i] !== undefined);
}
