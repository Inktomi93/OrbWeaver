// domain/search/persistence/scope — the chat-memory scope SQL-fragment builders (shared by
// digests/segments/corpus). SQL-fragment
// builders ONLY (no query execution — `digest-rows.ts` runs the scan); the WHERE belts that keep a
// cross-space / cross-scope / non-candidate row out of the result, applied BEFORE cosine rank (the no-leak
// invariant, D18/D20 — scope lives in the WHERE, never a post-filter).
//
// THE BELTS (domains/memory.md §6 is authoritative):
//   • SPACE — `model = ?` (the active embed model = the `(model, dim)` space tag; compare ONLY within one
//     space — providers.md §2b/§11). ALWAYS applied.
//   • WITHIN-CHAT — `chatId IN (...)`. The within-chat `digests`/`segments` lenses pass the ONE authorized
//     chat (`MemoryQueryOptions.scope.chat`); no membership derivation at all (the caller already holds the
//     chat). Optional `scopedCharacterId` narrows to the egocentric bucket for a full-pool scan.
//   • OWNER (cross-chat corpus) — `characters.ownerId = ?`, DERIVED via the producer card exactly like
//     `nearest.ts`'s owner belt: a digest's `scopedCharacterId` FKs `characters.id`, whose `ownerId` is the
//     owner. NO `chats.ownerId` (D18), NO `chat_participants` read — membership is MATERIALIZED at BUILD by
//     the witnessing horizons (a character's scoped bucket only holds blocks it witnessed), so the read-time
//     gate is just the owned bucket. This layer NEVER reads the `users` table.
//   • CANDIDATES (optional) — the tiered bridge restriction: score ONLY the given block-keys. Digests key on
//     the full `(chatId, scopedCharacterId, tier, blockIdx)` UNIQUE; segments key on `(chatId, blockIdx)`
//     (the verbatim lens carries no tier/scopedCharacterId column). Callers pass a NON-EMPTY candidate list
//     (an empty bridge short-circuits to `[]` in the verb before any scan).

import type { BlockKey } from "@orb/contracts/search";
import { characters, chatDigests, chatSegments } from "@orb/db";
import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";
import type { SQL } from "drizzle-orm";
import { and, eq, inArray, or } from "drizzle-orm";

interface DigestScopeParams {
  readonly model: string;
  /** The within-chat belt — the authorized chat(s). Omitted for an owner-wide (cross-chat) corpus scan. */
  readonly chatIds?: readonly ChatId[] | undefined;
  /** The cross-chat owner belt (derived via `characters.ownerId` — the digest scan JOINs `characters` on
   *  `scopedCharacterId`). Set by corpus; omitted by the within-chat lenses (the chat is already authorized). */
  readonly ownerId?: UserId | undefined;
  /** The egocentric bucket belt for a full-pool scan; ignored when `candidates` is present. */
  readonly scopedCharacterId?: CharacterId | undefined;
  /** Non-empty when restricting the scan to the tiered bridge block-keys (per-key full digest key match). */
  readonly candidates?: readonly BlockKey[] | undefined;
}

/** The WHERE belt for a `chat_digests` cosine scan (space ∩ within-chat|owner ∩ optional candidate/scoped).
 *  The scan MUST inner-join `characters` on `scopedCharacterId` so the owner belt resolves (D20 derive). */
export function digestScopeCond(params: DigestScopeParams): SQL | undefined {
  const belts: (SQL | undefined)[] = [eq(chatDigests.model, params.model)];
  if (params.chatIds !== undefined) {
    belts.push(inArray(chatDigests.chatId, [...params.chatIds]));
  }
  if (params.ownerId !== undefined) {
    belts.push(eq(characters.ownerId, params.ownerId));
  }
  if (params.candidates !== undefined) {
    belts.push(
      or(
        ...params.candidates.map((k) =>
          and(
            eq(chatDigests.chatId, k.chatId),
            eq(chatDigests.scopedCharacterId, k.scopedCharacterId),
            eq(chatDigests.tier, k.tier),
            eq(chatDigests.blockIdx, k.blockIdx),
          ),
        ),
      ),
    );
  } else if (params.scopedCharacterId !== undefined) {
    belts.push(eq(chatDigests.scopedCharacterId, params.scopedCharacterId));
  }
  return and(...belts);
}

interface SegmentScopeParams {
  readonly model: string;
  /** The chat set the verbatim lens is restricted to (the authorized chat for within-chat; the owner's
   *  materialized chat set — derived from the owner's digests — for cross-chat corpus). */
  readonly chatIds: readonly ChatId[];
  /** Non-empty when restricting to the bridge keys; segments match on `(chatId, blockIdx)` only (the
   *  verbatim lens has no tier/scopedCharacterId column). */
  readonly candidates?: readonly BlockKey[] | undefined;
}

/** The WHERE belt for a `chat_segments` cosine scan (space ∩ chat-set ∩ optional `(chatId, blockIdx)`). */
export function segmentScopeCond(params: SegmentScopeParams): SQL | undefined {
  const belts: (SQL | undefined)[] = [
    eq(chatSegments.model, params.model),
    inArray(chatSegments.chatId, [...params.chatIds]),
  ];
  if (params.candidates !== undefined) {
    belts.push(
      or(
        ...params.candidates.map((k) =>
          and(eq(chatSegments.chatId, k.chatId), eq(chatSegments.blockIdx, k.blockIdx)),
        ),
      ),
    );
  }
  return and(...belts);
}
