// chat-visibility — the ONE spelling of "which chat rows a member may see", and the ONE recency clock those
// rows are ordered and stamped by. Both are SQL over `chats`/`chat_participants`/`messages`, so they need
// drizzle column types and cannot be `@orb/kit`-pure: db/kit is their home, exactly as `fetch-owned.ts` is
// the home of the D23 single-owned scope predicate.
//
// WHY IT IS NOT INSIDE `domain/chat` (#1131). Two domains have to agree on these two facts and neither may
// import the other (constitution §2 — a sideways domain import is automatically wrong):
//   · `domain/chat/persistence/queries.ts` — `listMemberChats`/`countMemberChats`, the chat library.
//   · `domain/character/persistence/queries.ts` — the character library row's `lastChattedAt`/`chatCount`,
//     which the Characters landing PRINTS ("chatted 3h ago · 4 chats") and the `recent`/`mostChats`/
//     `fewestChats` keysets ORDER BY.
// They used to disagree by construction: the character list read `character_stats.last_activity_at` +
// `character_stats.chats`, a STATS rollup, while the chat library, the editor header and the context pane
// all counted canon. Measured on the dev library 2026-09-02: nine of ten characters had NO stats row at all
// (so the landing's "Recently chatted" shelf could show exactly one face), and the tenth read `chats = 0`
// against a real seated chat — because the rollup's chat counter is bumped only for a room's FIRST founding
// character (`chatCreatedDelta`, `claim-chat.ts`), while a later seat contributes message deltas only. A
// rollup of turn economics is not a census of rooms; this is.
//
// TWO CALLERS, ONE PREDICATE — a change to the husk/temporary/archived law lands for both at once.
//
// THE ENFORCER (constitution §2 — a placement names the tier that REDs its violation). The one-directional
// package cake is the enforcer of the HOME: `db` sits below both `server` domains, so `character` reaching
// for `chat`'s copy of these predicates would be a sideways domain import that dependency-cruiser reds, and
// `chat` reaching UP for anything does not resolve at all. What the cake CANNOT catch is a domain quietly
// RE-SPELLING the four arms inline instead of importing them — that is the thing to grep for
// (`chats.temporary` / `chats.startedAt` / `chatParticipants.leftSeq` outside this file and
// `domain/chat/persistence`), and the honesty mechanism for it is `tests/db/kit/chat-visibility.int.test.ts`
// plus the character-library pins, which assert the LENS behaviour (a husk counts zero, a second seat counts
// one) rather than the spelling — a re-spelling that drifts fails them.
//
// THE PRECEDENT: `fetch-owned.ts`, one directory over, already homes the D23 single-owned OWNERSHIP scope
// here for exactly this reason — a scope predicate needed by more than one domain, needing drizzle types, and
// with no legal home inside either domain.

import type { UserId } from "@orb/kit/ids";
import type { SQL } from "drizzle-orm";
import { and, eq, isNotNull, isNull, max, sql } from "drizzle-orm";
import type { Db } from "../client/index.ts";
import { chatParticipants, chats, messages, messageVariants } from "../schema/index.ts";

/** The lens the visibility scope leaves to its caller: archived rooms are hidden unless asked for. */
export interface ChatVisibilityLens {
  /** Include archived rooms. Absent/`false` ⇒ archived rows are out of scope. */
  readonly includeArchived?: boolean | undefined;
}

/**
 * THE MEMBER-VISIBLE CHAT SCOPE — the predicate a `chats ⋈ chat_participants` read must carry for its rows
 * to be "chats this user has". Written as a JOIN-ON clause: it correlates `chat_participants` to `chats`
 * itself, so a caller joins the two and passes this.
 *
 * Four arms, each load-bearing:
 *   · the caller's own PRESENT membership row (`left_seq` null) — D18 scope is membership, not ownership;
 *   · `temporary = false` — an ST temporary room persists so turns can run but never enters the library;
 *   · `started_at NOT NULL` — the HUSK lens (R0 §4.3): a room nobody claimed is hidden from EVERYONE,
 *     including its creator, and is reap-eligible. NOT gated by `includeArchived` — archived is a state of
 *     a real chat, unstarted is the absence of one;
 *   · the archived lens.
 */
export function memberVisibleChatScope(userId: UserId, lens: ChatVisibilityLens): SQL | undefined {
  return and(
    eq(chatParticipants.chatId, chats.id),
    eq(chatParticipants.userId, userId),
    isNull(chatParticipants.leftSeq),
    eq(chats.temporary, false),
    isNotNull(chats.startedAt),
    lens.includeArchived === true ? undefined : eq(chats.archived, false),
  );
}

/**
 * THE ONE RECENCY CLOCK of the chat library (#150, owner-observed live 2026-08-17) — a room's newest
 * message time, falling back to its row stamp when it has no message: `coalesce(max(created_at), updated_at)`.
 *
 * IT IS THE DISPLAY KEY, IN SQL. Every surface DISPLAYS `lastMessageAt ?? updatedAt`; ordering on
 * `chats.updated_at` instead disagrees in BOTH directions (appending a message does not write the chat row,
 * a metadata touch does). It mirrors `loadChatMessageStats`' predicate exactly, selected-variant join
 * included, so a slot whose selected variant is gone moves neither the stamp nor the sort.
 *
 * Correlated on `chats.id`, so it is valid anywhere `chats` is in scope — the chat library's ORDER BY and
 * cursor, and the character library's per-character `MAX` (below).
 */
export function chatRecencyExpr(db: Db): SQL<number> {
  return sql<number>`coalesce((${db
    .select({ at: max(messages.createdAt) })
    .from(messages)
    .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
    .where(eq(messages.chatId, chats.id))}), ${chats.updatedAt})`;
}
