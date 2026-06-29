// domain/embeddings/persistence/queries — ALL db access for the store + hub-score write paths (queries only;
// no business logic, no I/O — the CAS/embed handles are injected upstream, so `persistence-no-io` holds).
//
// THE LOAD-BEARING WRITE RULES encoded here:
//   • A vector upsert NEVER writes `hub_score` — it is absent from every `.values(...)` and every
//     `onConflictDoUpdate.set(...)` here, so a re-embed leaves the advisory-stale CSLS score untouched (the
//     neo reset-in-3-places bug is structurally impossible; §invariant 2).
//   • `hub_score` is written ONLY by {@link writeHubScoreRows} (§invariant 3) — the `discovery` seam.
//   • `existing*Hash` reads the stored `content_hash` for the upsert key so the verb can short-circuit a
//     no-op BEFORE the expensive embed (the staleness gate).
//   • The upsert `target` is the table's idempotent UNIQUE: `(characterId, model)` /
//     `(assetId, model, lens)` — a re-embed of the same key+space updates in place (never doubles a row).

import type { ImageLens } from "@orb/contracts/embeddings";
import type { Db } from "@orb/db";
import {
  batchMany,
  batchStmt,
  characterEmbeddings,
  chatDigests,
  chatSegments,
  imageEmbeddings,
} from "@orb/db";
import type {
  AssetId,
  CharacterEmbeddingId,
  CharacterId,
  ChatDigestId,
  ChatId,
  ChatSegmentId,
  ImageEmbeddingId,
} from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";
import type { HubScoreUpdate, VectorTable } from "../contract/params";

const LIMIT_ONE = 1;

// ── staleness-gate reads (the stored content_hash for the upsert key) ─────────

/** The stored `content_hash` for `(characterId, model)`, or `undefined` when no row exists yet. */
export async function existingCharacterHash(
  db: Db,
  characterId: CharacterId,
  model: string,
): Promise<string | undefined> {
  const rows = await db
    .select({ hash: characterEmbeddings.contentHash })
    .from(characterEmbeddings)
    .where(
      and(eq(characterEmbeddings.characterId, characterId), eq(characterEmbeddings.model, model)),
    )
    .limit(LIMIT_ONE);
  return rows[0]?.hash;
}

/** The stored `content_hash` for `(assetId, model, lens)`, or `undefined` when no row exists yet. */
export async function existingImageHash(
  db: Db,
  assetId: AssetId,
  lens: ImageLens,
  model: string,
): Promise<string | undefined> {
  const rows = await db
    .select({ hash: imageEmbeddings.contentHash })
    .from(imageEmbeddings)
    .where(
      and(
        eq(imageEmbeddings.assetId, assetId),
        eq(imageEmbeddings.model, model),
        eq(imageEmbeddings.lens, lens),
      ),
    )
    .limit(LIMIT_ONE);
  return rows[0]?.hash;
}

// ── vector upserts (hash-gated; NEVER touch hub_score) ────────────────────────

/** The persistence-internal arg bundle for {@link upsertCharacterEmbedding} (file-local — types-in-contract). */
interface UpsertCharacterInput {
  readonly id: CharacterEmbeddingId;
  readonly characterId: CharacterId;
  readonly embedding: Float32Array;
  readonly contentHash: string;
  readonly model: string;
  readonly dim: number;
  /** Epoch-ms from the injected clock — the insert's `created_at` (kept on a conflict update). */
  readonly now: number;
}

/** Upsert a card-text vector by `(characterId, model)`. On conflict updates `embedding`/`content_hash`/`dim`
 *  only — `hub_score`, `model`, `created_at` are left as-is. */
export async function upsertCharacterEmbedding(db: Db, input: UpsertCharacterInput): Promise<void> {
  await db
    .insert(characterEmbeddings)
    .values({
      id: input.id,
      characterId: input.characterId,
      embedding: input.embedding,
      contentHash: input.contentHash,
      model: input.model,
      dim: input.dim,
      createdAt: input.now,
    })
    .onConflictDoUpdate({
      target: [characterEmbeddings.characterId, characterEmbeddings.model],
      set: {
        embedding: input.embedding,
        contentHash: input.contentHash,
        dim: input.dim,
      },
    });
}

/** The persistence-internal arg bundle for {@link upsertImageEmbedding} (file-local). */
interface UpsertImageInput {
  readonly id: ImageEmbeddingId;
  readonly assetId: AssetId;
  readonly lens: ImageLens;
  /** The generated caption (image-captioned) or `null` (image-raw). */
  readonly caption: string | null;
  readonly captionMeta: Record<string, unknown> | null;
  readonly embedding: Float32Array;
  readonly contentHash: string;
  readonly model: string;
  readonly dim: number;
  readonly now: number;
}

/** Upsert an image vector by `(assetId, model, lens)`. On conflict updates the vector + caption + hash + dim
 *  only — `hub_score`, the key columns, and `created_at` are left as-is. */
export async function upsertImageEmbedding(db: Db, input: UpsertImageInput): Promise<void> {
  await db
    .insert(imageEmbeddings)
    .values({
      id: input.id,
      assetId: input.assetId,
      lens: input.lens,
      caption: input.caption,
      captionMeta: input.captionMeta,
      embedding: input.embedding,
      contentHash: input.contentHash,
      model: input.model,
      dim: input.dim,
      createdAt: input.now,
    })
    .onConflictDoUpdate({
      target: [imageEmbeddings.assetId, imageEmbeddings.model, imageEmbeddings.lens],
      set: {
        embedding: input.embedding,
        caption: input.caption,
        captionMeta: input.captionMeta,
        contentHash: input.contentHash,
        dim: input.dim,
      },
    });
}

/** The stored `content_hash` for a chat segment `(chatId, blockIdx)`, or `undefined` when no row exists. */
export async function existingSegmentHash(
  db: Db,
  chatId: ChatId,
  blockIdx: number,
): Promise<string | undefined> {
  const rows = await db
    .select({ hash: chatSegments.contentHash })
    .from(chatSegments)
    .where(and(eq(chatSegments.chatId, chatId), eq(chatSegments.blockIdx, blockIdx)))
    .limit(LIMIT_ONE);
  return rows[0]?.hash;
}

/** The stored `content_hash` for a chat digest `(chatId, scopedCharacterId, tier, blockIdx)`, or `undefined`
 *  when no row exists. The scope key is part of the staleness identity (scope folds into the hash — §4). */
export async function existingDigestHash(
  db: Db,
  key: { chatId: ChatId; scopedCharacterId: CharacterId; tier: number; blockIdx: number },
): Promise<string | undefined> {
  const rows = await db
    .select({ hash: chatDigests.contentHash })
    .from(chatDigests)
    .where(
      and(
        eq(chatDigests.chatId, key.chatId),
        eq(chatDigests.scopedCharacterId, key.scopedCharacterId),
        eq(chatDigests.tier, key.tier),
        eq(chatDigests.blockIdx, key.blockIdx),
      ),
    )
    .limit(LIMIT_ONE);
  return rows[0]?.hash;
}

/** The persistence-internal arg bundle for {@link upsertChatSegment} (file-local — types-in-contract). */
interface UpsertSegmentInput {
  readonly id: ChatSegmentId;
  readonly chatId: ChatId;
  readonly blockIdx: number;
  readonly seqStart: number;
  readonly seqEnd: number;
  readonly text: string;
  readonly embedding: Float32Array;
  readonly contentHash: string;
  readonly model: string;
  readonly dim: number;
  readonly now: number;
}

/** Upsert a verbatim segment by `(chatId, blockIdx)`. On conflict updates the vector + text + seq-span +
 *  hash + dim only — `hub_score`, the key columns, and `created_at` are left as-is (§invariant 2). */
export async function upsertChatSegment(db: Db, input: UpsertSegmentInput): Promise<void> {
  await db
    .insert(chatSegments)
    .values({
      id: input.id,
      chatId: input.chatId,
      blockIdx: input.blockIdx,
      seqStart: input.seqStart,
      seqEnd: input.seqEnd,
      text: input.text,
      embedding: input.embedding,
      contentHash: input.contentHash,
      model: input.model,
      dim: input.dim,
      createdAt: input.now,
    })
    .onConflictDoUpdate({
      target: [chatSegments.chatId, chatSegments.blockIdx],
      set: {
        seqStart: input.seqStart,
        seqEnd: input.seqEnd,
        text: input.text,
        embedding: input.embedding,
        contentHash: input.contentHash,
        dim: input.dim,
      },
    });
}

/** The persistence-internal arg bundle for {@link upsertChatDigest} (file-local). */
interface UpsertDigestInput {
  readonly id: ChatDigestId;
  readonly chatId: ChatId;
  readonly scopedCharacterId: CharacterId;
  readonly isGroup: boolean;
  readonly tier: number;
  readonly blockIdx: number;
  readonly text: string;
  readonly topicAnchor: string;
  readonly keywords: readonly string[];
  readonly embedding: Float32Array;
  readonly contentHash: string;
  readonly model: string;
  readonly dim: number;
  readonly now: number;
}

/** Upsert a distilled digest by `(chatId, scopedCharacterId, tier, blockIdx)`. On conflict updates the
 *  vector + text + the §2b facets + hash + dim only — `hub_score`, the key columns, and `created_at` are left
 *  as-is (§invariant 2; the scope key is part of the staleness identity — §4). */
export async function upsertChatDigest(db: Db, input: UpsertDigestInput): Promise<void> {
  await db
    .insert(chatDigests)
    .values({
      id: input.id,
      chatId: input.chatId,
      scopedCharacterId: input.scopedCharacterId,
      isGroup: input.isGroup,
      tier: input.tier,
      blockIdx: input.blockIdx,
      text: input.text,
      topicAnchor: input.topicAnchor,
      keywords: [...input.keywords],
      embedding: input.embedding,
      contentHash: input.contentHash,
      model: input.model,
      dim: input.dim,
      createdAt: input.now,
    })
    .onConflictDoUpdate({
      target: [
        chatDigests.chatId,
        chatDigests.scopedCharacterId,
        chatDigests.tier,
        chatDigests.blockIdx,
      ],
      set: {
        text: input.text,
        topicAnchor: input.topicAnchor,
        keywords: [...input.keywords],
        isGroup: input.isGroup,
        embedding: input.embedding,
        contentHash: input.contentHash,
        dim: input.dim,
      },
    });
}

// ── the hub-score write seam (the ONLY hub_score writer; §invariant 3) ────────

function assertNever(value: never): never {
  throw new Error(`writeHubScoreRows: unhandled vector table ${String(value)}`);
}

/** Batch-UPDATE `hub_score` keyed `(id, model)` on the given table, in one `db.batch` round-trip. Returns
 *  the count of rows actually touched (an id/model matching no row contributes 0). Dispatch is
 *  `assertNever`-exhaustive over {@link VectorTable} — a new table fails `tsc` until its arm is added. */
export async function writeHubScoreRows(
  db: Db,
  table: VectorTable,
  updates: readonly HubScoreUpdate[],
): Promise<number> {
  if (updates.length === 0) {
    return 0;
  }
  switch (table) {
    case "character_embeddings": {
      const stmts = updates.map((u) =>
        batchStmt(
          db
            .update(characterEmbeddings)
            .set({ hubScore: u.hubScore })
            .where(
              and(
                eq(characterEmbeddings.id, castId<CharacterEmbeddingId>(u.id)),
                eq(characterEmbeddings.model, u.model),
              ),
            )
            .returning({ id: characterEmbeddings.id }),
        ),
      );
      const results = await db.batch(batchMany(stmts));
      return results.reduce((sum, r) => sum + r.length, 0);
    }
    case "image_embeddings": {
      const stmts = updates.map((u) =>
        batchStmt(
          db
            .update(imageEmbeddings)
            .set({ hubScore: u.hubScore })
            .where(
              and(
                eq(imageEmbeddings.id, castId<ImageEmbeddingId>(u.id)),
                eq(imageEmbeddings.model, u.model),
              ),
            )
            .returning({ id: imageEmbeddings.id }),
        ),
      );
      const results = await db.batch(batchMany(stmts));
      return results.reduce((sum, r) => sum + r.length, 0);
    }
    case "chat_digests": {
      const stmts = updates.map((u) =>
        batchStmt(
          db
            .update(chatDigests)
            .set({ hubScore: u.hubScore })
            .where(
              and(eq(chatDigests.id, castId<ChatDigestId>(u.id)), eq(chatDigests.model, u.model)),
            )
            .returning({ id: chatDigests.id }),
        ),
      );
      const results = await db.batch(batchMany(stmts));
      return results.reduce((sum, r) => sum + r.length, 0);
    }
    case "chat_segments": {
      const stmts = updates.map((u) =>
        batchStmt(
          db
            .update(chatSegments)
            .set({ hubScore: u.hubScore })
            .where(
              and(
                eq(chatSegments.id, castId<ChatSegmentId>(u.id)),
                eq(chatSegments.model, u.model),
              ),
            )
            .returning({ id: chatSegments.id }),
        ),
      );
      const results = await db.batch(batchMany(stmts));
      return results.reduce((sum, r) => sum + r.length, 0);
    }
    default:
      return assertNever(table);
  }
}
