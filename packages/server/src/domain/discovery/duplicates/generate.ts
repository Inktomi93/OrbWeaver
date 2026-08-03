// domain/discovery/duplicates/generate — the near-duplicate CHARACTER pass (the `find-duplicates` workload).
// Per (owner, embedding-space) all-pairs cosine over card embeddings, content-hash collapsed, CSLS-ranked,
// recorded in `duplicate_character_pairs` (per-type FK + CASCADE, D24 — no sweep; a deleted character drops
// its pairs by physics).
//
// NO chat near-dup arm here. DEFER(promotion): `duplicate_chat_pairs` (Jaccard-of-segment-content-hashes +
// `forkRoots` lineage walk + the `relation: duplicate|forked` axis from @orb/contracts/discovery) → the chat
// near-dup wave when the chat fork-lineage read lands. Characters have NO fork lineage (D28 snapshots), so a
// character pair is always an accidental look-alike and carries no `relation` column (schema/discovery.ts).
//
// IN-RAM, not SQL (the two-cosine-access-patterns rule): this is all-pairs ANALYTICS — `@orb/kit/
// vector-math` over the loaded vectors — NOT top-k retrieval (that is `search`'s `vector_distance_cos`).
// discovery issues no `vector_distance_cos`.

import type { DuplicateRelation } from "@orb/contracts/discovery";
import type { Db } from "@orb/db";
import { characters, chatParticipants, duplicateCharacterPairs, duplicateChatPairs } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany, chunkRows, rowsPerInsert } from "@orb/db/kit";
import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { ComputeChatDuplicatesOptions, ComputeDuplicatesOptions } from "../contract/params.ts";
import type { DuplicateChatComputeStats, DuplicateComputeStats } from "../contract/results.ts";
import type { ComputeChatDuplicatesDeps, ComputeDuplicatesDeps } from "../contract/service.ts";
import { readOwnedCharacterVectors, readOwnedChatLineage, readOwnedChatSegmentHashes } from "../persistence/embed-store-reads.ts";
import { collapseByHash } from "../substrate/collapse.ts";
import { forkRoots } from "../substrate/fork-roots.ts";
import { computeGroupHubs } from "../substrate/hub-math.ts";
import { pairsAboveThreshold } from "../substrate/pair-cosine.ts";

/** The raw-cosine floor a card pair must clear to be recorded as a near-duplicate (a hub-deflated near-dup
 *  must still BE a near-dup, so the gate is on raw cosine; `cslsScore` only ranks). Re-exported from the
 *  front door for the workload runner's log + the tRPC default. */
export const DEFAULT_DUP_THRESHOLD = 0.92;

// The insert column count for duplicate_character_pairs (id, A, B, csls, sim, model, computedAt) — the
// per-insert row-chunk budget (libSQL bound-variable cap).
const DUP_COLS = 7;

type DupInsert = typeof duplicateCharacterPairs.$inferInsert;

function groupBy<T>(rows: readonly T[], keyOf: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const bucket = groups.get(key);
    if (bucket === undefined) {
      groups.set(key, [row]);
    } else {
      bucket.push(row);
    }
  }
  return groups;
}

// Canonicalize an unordered pair to A<B (the character_id_a < character_id_b CHECK + unique index).
function canonical(a: CharacterId, b: CharacterId): { readonly a: CharacterId; readonly b: CharacterId } {
  return a < b ? { a, b } : { a: b, b: a };
}

/**
 * Recompute EVERY owner's near-duplicate character pairs — a full atomic replace of
 * `duplicate_character_pairs`. Standalone `(db, deps, opts?)` so the `find-duplicates` runner drives it
 * without the whole service (the compute* passes stay standalone-exportable).
 */
export async function computeDuplicatePairs(db: Db, deps: ComputeDuplicatesDeps, opts: ComputeDuplicatesOptions = {}): Promise<DuplicateComputeStats> {
  const threshold = opts.threshold ?? DEFAULT_DUP_THRESHOLD;
  const rows = await readOwnedCharacterVectors(db, opts.ownerId);
  const computedAt = deps.now();

  const owners = new Set<string>();
  const inserts: DupInsert[] = [];
  // One group per (owner, space) — a pair is only meaningful within one owner's library AND one space.
  for (const [, group] of groupBy(rows, (r) => `${r.ownerId}\u0000${r.model}`)) {
    const first = group[0];
    if (first === undefined) {
      continue;
    }
    owners.add(first.ownerId);
    // Collapse fork/import copies (esoteric #3) — the all-pairs scan runs over reps; identical-hash copies
    // collapse to one rep and are not re-emitted as a (trivially identical) pair.
    const { reps } = collapseByHash(
      group,
      (r) => r.contentHash,
      (r) => r.characterId,
    );
    const repVecs = reps.map((r) => r.embedding);
    const hubs = computeGroupHubs(repVecs);
    for (const pair of pairsAboveThreshold(repVecs, hubs, threshold)) {
      const repA = reps[pair.i];
      const repB = reps[pair.j];
      if (repA === undefined || repB === undefined) {
        continue;
      }
      const { a, b } = canonical(repA.characterId, repB.characterId);
      inserts.push({
        id: deps.newDuplicateCharacterPairId(),
        characterIdA: a,
        characterIdB: b,
        cslsScore: pair.cslsScore,
        similarity: pair.similarity,
        model: first.model,
        computedAt,
      });
    }
  }

  await replaceAllPairs(db, inserts, opts.ownerId);
  return {
    ownersProcessed: owners.size,
    charactersScanned: rows.length,
    pairsWritten: inserts.length,
  };
}

// Atomic replace: ONE db.batch of [delete, ...chunked inserts] so a read never sees a half-rebuilt set.
// `ownerId` scopes the DELETE to that owner's pairs (the SINGULAR pass — a pair is canonicalized a<b with BOTH
// chars the same owner, so `characterIdA IN (that owner's characters)` selects exactly their pairs and never
// another owner's); omitted/null = delete-ALL (the BULK global rebuild).
async function replaceAllPairs(db: Db, inserts: readonly DupInsert[], ownerId?: UserId | null): Promise<void> {
  const del =
    ownerId === undefined || ownerId === null
      ? db.delete(duplicateCharacterPairs)
      : db
          .delete(duplicateCharacterPairs)
          .where(inArray(duplicateCharacterPairs.characterIdA, db.select({ id: characters.id }).from(characters).where(eq(characters.ownerId, ownerId))));
  const stmts: BatchStmt[] = [del];
  for (const chunk of chunkRows(inserts, rowsPerInsert(DUP_COLS))) {
    stmts.push(db.insert(duplicateCharacterPairs).values(chunk));
  }
  await db.batch(batchMany(stmts));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE CHAT NEAR-DUP ARM — Jaccard of segment content-hashes (NOT centroid cosine: a per-chat centroid is
// dominated by the character's persistent voice, so same-character chats falsely score ≥ 0.92). An inverted
// `hash → chats` index yields candidate pairs; the fork-lineage walk (`substrate/fork-roots`) labels a pair
// `forked` (shared root) vs `duplicate` (independent look-alike). Writes `duplicate_chat_pairs`.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

/** The Jaccard floor a chat pair must clear to be recorded as a near-duplicate. */
export const DEFAULT_CHAT_JACCARD = 0.5;

// A fixed sentinel `model` — the chat arm is content-hash Jaccard, not embedding-space specific (a pair is
// meaningful across all spaces since content_hash is model-independent). The column is NOT NULL, so it carries
// this constant rather than a real embedding space tag.
const CHAT_JACCARD_MODEL = "content-hash-jaccard";
// duplicate_chat_pairs insert column count (id, A, B, csls, sim, relation, model, computedAt).
const CHAT_DUP_COLS = 8;

type ChatDupInsert = typeof duplicateChatPairs.$inferInsert;
type ChatHashRow = Awaited<ReturnType<typeof readOwnedChatSegmentHashes>>[number];
type ChatLineageRow = Awaited<ReturnType<typeof readOwnedChatLineage>>[number];

function canonicalChat(a: ChatId, b: ChatId): { readonly a: ChatId; readonly b: ChatId } {
  return a < b ? { a, b } : { a: b, b: a };
}

// Per-chat content-hash SETS from the flat (chatId, contentHash) rows of one owner.
function hashSetsByChat(rows: readonly ChatHashRow[]): Map<ChatId, Set<string>> {
  const sets = new Map<ChatId, Set<string>>();
  for (const row of rows) {
    const set = sets.get(row.chatId);
    if (set === undefined) {
      sets.set(row.chatId, new Set([row.contentHash]));
    } else {
      set.add(row.contentHash);
    }
  }
  return sets;
}

// Candidate chat-pair KEYS (canonical "a\u0000b") that share ≥1 content-hash — the inverted-index prune (only
// chats with an overlapping block are ever scored, never the full O(n²) all-pairs).
function candidatePairs(hashSets: ReadonlyMap<ChatId, Set<string>>): Set<string> {
  const byHash = new Map<string, ChatId[]>();
  for (const [chatId, hashes] of hashSets) {
    for (const hash of hashes) {
      const bucket = byHash.get(hash);
      if (bucket === undefined) {
        byHash.set(hash, [chatId]);
      } else {
        bucket.push(chatId);
      }
    }
  }
  const pairs = new Set<string>();
  for (const chatsWithHash of byHash.values()) {
    for (let i = 0; i < chatsWithHash.length; i += 1) {
      for (let j = i + 1; j < chatsWithHash.length; j += 1) {
        const { a, b } = canonicalChat(chatsWithHash[i] as ChatId, chatsWithHash[j] as ChatId);
        pairs.add(`${a}\u0000${b}`);
      }
    }
  }
  return pairs;
}

// The Jaccard overlap |A∩B| / |A∪B| of two content-hash sets.
function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  let inter = 0;
  for (const h of a) {
    if (b.has(h)) {
      inter += 1;
    }
  }
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

// Build ONE owner's above-threshold chat-pair inserts (Jaccard + fork-root relation).
function buildOwnerChatPairs(
  hashRows: readonly ChatHashRow[],
  lineage: readonly ChatLineageRow[],
  cfg: { deps: ComputeChatDuplicatesDeps; threshold: number; computedAt: number },
): ChatDupInsert[] {
  const { deps, threshold, computedAt } = cfg;
  const hashSets = hashSetsByChat(hashRows);
  const roots = forkRoots(new Map(lineage.map((e) => [e.chatId, e.parentChatId])));
  const inserts: ChatDupInsert[] = [];
  for (const key of candidatePairs(hashSets)) {
    const [aRaw, bRaw] = key.split("\u0000");
    const a = aRaw as ChatId;
    const b = bRaw as ChatId;
    const setA = hashSets.get(a);
    const setB = hashSets.get(b);
    if (setA === undefined || setB === undefined) {
      continue;
    }
    const similarity = jaccard(setA, setB);
    if (similarity < threshold) {
      continue;
    }
    const relation: DuplicateRelation = roots.get(a) !== undefined && roots.get(a) === roots.get(b) ? "forked" : "duplicate";
    inserts.push({
      id: deps.newDuplicateChatPairId(),
      chatIdA: a,
      chatIdB: b,
      cslsScore: similarity, // Jaccard IS the rank key for chats (no cosine-hub adjustment).
      similarity,
      relation,
      model: CHAT_JACCARD_MODEL,
      computedAt,
    });
  }
  return inserts;
}

function groupHashRowsByOwner(rows: readonly ChatHashRow[]): Map<UserId, ChatHashRow[]> {
  const groups = new Map<UserId, ChatHashRow[]>();
  for (const row of rows) {
    const bucket = groups.get(row.ownerId);
    if (bucket === undefined) {
      groups.set(row.ownerId, [row]);
    } else {
      bucket.push(row);
    }
  }
  return groups;
}

/**
 * Recompute EVERY owner's near-duplicate CHAT pairs — a full atomic replace of `duplicate_chat_pairs`.
 * Standalone `(db, deps, opts?)` so the `find-duplicates` runner drives it alongside the character arm.
 */
export async function computeChatDuplicatePairs(
  db: Db,
  deps: ComputeChatDuplicatesDeps,
  opts: ComputeChatDuplicatesOptions = {},
): Promise<DuplicateChatComputeStats> {
  const threshold = opts.threshold ?? DEFAULT_CHAT_JACCARD;
  const [hashRows, lineage] = await Promise.all([readOwnedChatSegmentHashes(db, opts.ownerId), readOwnedChatLineage(db, opts.ownerId)]);
  const computedAt = deps.now();
  const hashByOwner = groupHashRowsByOwner(hashRows);
  const lineageByOwner = new Map<UserId, ChatLineageRow[]>();
  for (const edge of lineage) {
    const bucket = lineageByOwner.get(edge.ownerId);
    if (bucket === undefined) {
      lineageByOwner.set(edge.ownerId, [edge]);
    } else {
      bucket.push(edge);
    }
  }

  const inserts: ChatDupInsert[] = [];
  const chatIds = new Set<string>();
  for (const [ownerId, rows] of hashByOwner) {
    for (const r of rows) {
      chatIds.add(r.chatId);
    }
    inserts.push(
      ...buildOwnerChatPairs(rows, lineageByOwner.get(ownerId) ?? [], {
        deps,
        threshold,
        computedAt,
      }),
    );
  }

  await replaceAllChatPairs(db, inserts, opts.ownerId);
  return {
    ownersProcessed: hashByOwner.size,
    chatsScanned: chatIds.size,
    pairsWritten: inserts.length,
  };
}

// Atomic replace: ONE db.batch of [delete, ...chunked inserts]. `ownerId` scopes the DELETE to that owner's
// pairs (chatIdA hosted by the owner — duplicate_chat_pairs has no ownerId, D23); null = delete-ALL.
async function replaceAllChatPairs(db: Db, inserts: readonly ChatDupInsert[], ownerId?: UserId | null): Promise<void> {
  const del =
    ownerId === undefined || ownerId === null
      ? db.delete(duplicateChatPairs)
      : db.delete(duplicateChatPairs).where(
          inArray(
            duplicateChatPairs.chatIdA,
            db
              .select({ id: chatParticipants.chatId })
              .from(chatParticipants)
              .where(
                and(
                  eq(chatParticipants.userId, ownerId),
                  eq(chatParticipants.kind, "human"),
                  eq(chatParticipants.role, "host"),
                  isNull(chatParticipants.leftSeq),
                ),
              ),
          ),
        );
  const stmts: BatchStmt[] = [del];
  for (const chunk of chunkRows(inserts, rowsPerInsert(CHAT_DUP_COLS))) {
    stmts.push(db.insert(duplicateChatPairs).values(chunk));
  }
  await db.batch(batchMany(stmts));
}
