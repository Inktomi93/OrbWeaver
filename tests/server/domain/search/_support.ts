// Shared test harness for the search domain (NOT a test file — no `.test` suffix, so test-layout ignores
// it). Builds a real-db `SearchContext` with a SCRIPTED `RoleClients` bundle — the sanctioned "fake at the
// edges, inject at the root" doctrine (testing §3): a real injected dep, not an internal-module mock. The
// fake's `embed` maps a query string → a chosen vector (so `vector_distance_cos` picks the seeded
// neighbour deterministically) and its `rerank` is per-test scriptable (custom order, or a rejecting
// not-supported throw). Seeds the rows the verbs read (users / characters / character_embeddings /
// character_summaries / assets) directly — a test fixture may read/seed `users` (the `no-direct-users-read`
// gate scopes only `packages/server/src/domain`).

import type {
  EmbedResult,
  ImageEmbedResult,
  RerankResult,
  SummarizeResult,
} from "@orb/contracts/providers";
import type {
  ImageEmbedInput,
  RerankDocument,
  RerankQuery,
  RoleClients,
  SummarizeInput,
} from "@orb/contracts/role-clients";
import type { Db } from "@orb/db";
import {
  assets,
  characterEmbeddings,
  characterSummaries,
  characters,
  chatDigests,
  chatSegments,
  chats,
} from "@orb/db";
import type {
  AssetId,
  CharacterEmbeddingId,
  CharacterId,
  ChatDigestId,
  ChatId,
  ChatSegmentId,
  Handle,
  UserId,
} from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type {
  SearchContext,
  SearchService,
} from "../../../../packages/server/src/domain/search/index.ts";
import { createSearchService } from "../../../../packages/server/src/domain/search/index.ts";
import { FROZEN_AT_MS } from "../../../support/clock.ts";
import { seedUser as seedUserRow } from "../../../support/factories/user.ts";

const FROZEN_AT = FROZEN_AT_MS;

/** The one 1024-dim space the schema's `F32_BLOB(1024)` columns require. */
export const VECTOR_DIM = 1024;
/** The default embed model the harness scopes the scan to (the `(model, dim)` space tag). */
export const EMBED_MODEL = "test-embed-model-1024";

/** Build a 1024-dim vector with the given leading components (the rest zero) — enough for deterministic
 *  cosine ranking (e.g. `vec(1)` vs `vec(0, 1)` are orthogonal; `vec(1)` matches `vec(1)` exactly). */
export function vec(...components: readonly number[]): Float32Array<ArrayBuffer> {
  const v = new Float32Array(VECTOR_DIM);
  for (let i = 0; i < components.length; i += 1) {
    v[i] = components[i] ?? 0;
  }
  return v;
}

export interface FakeRoleClientControls {
  /** Map the query string → its embedding (null = the embedder filtered it ⇒ empty-query path). */
  readonly embedVector?: (input: string) => Float32Array<ArrayBuffer> | null;
  /** The rerank impl — default returns documents in their incoming order (descending score). Override to
   *  script a custom reorder, or to reject with a not-supported throw (PD-11). */
  readonly rerank?: RoleClients["rerank"];
  readonly embedModel?: string;
}

/** A scripted `RoleClients` — only `embed` / `rerank` matter to search; the other roles are never called
 *  in the W2 core (typed stubs so the bundle satisfies the interface). */
export function makeFakeRoleClients(controls: FakeRoleClientControls = {}): RoleClients {
  const embedModel = controls.embedModel ?? EMBED_MODEL;
  const embedVector = controls.embedVector ?? ((): Float32Array<ArrayBuffer> => vec(1));

  const rerank: RoleClients["rerank"] =
    controls.rerank ??
    ((_query: RerankQuery, documents: RerankDocument[]): Promise<RerankResult> =>
      Promise.resolve({
        hits: documents.map((d, i) => ({ id: d.id, score: documents.length - i })),
        model: "test-rerank-model",
        usage: { totalTokens: null },
      }));

  return {
    embed: (input: string | string[]): Promise<EmbedResult> => {
      const inputs = Array.isArray(input) ? input : [input];
      return Promise.resolve({
        vectors: inputs.map((t) => embedVector(t)),
        model: embedModel,
        usage: { promptTokens: null, totalTokens: null },
      });
    },
    rerank,
    imageEmbed: (_req: ImageEmbedInput): Promise<ImageEmbedResult> =>
      Promise.resolve({ vectors: [], model: "test-image-embed-model" }),
    summarize: (_inputs: SummarizeInput[]): Promise<SummarizeResult> =>
      Promise.resolve({ items: [], model: "test-summarize-model" }),
    embedModel,
    rerankModel: "test-rerank-model",
    imageEmbedModel: "test-image-embed-model",
    summarizerModel: "test-summarize-model",
    summarizerContextTokens: 32_000,
  };
}

/** Build the search service over a real db + a scripted role-clients bundle. */
export function makeSearch(db: Db, controls?: FakeRoleClientControls): SearchService {
  const ctx: SearchContext = { db, roleClients: makeFakeRoleClients(controls) };
  return createSearchService(ctx);
}

interface SeedUserOverrides {
  readonly id?: string;
  readonly handle?: string;
}

/** Thin delegate over the canonical factory — search's call sites want the id back, not the row. */
export async function seedUser(db: Db, overrides: SeedUserOverrides = {}): Promise<UserId> {
  const id = castId<UserId>(overrides.id ?? `user_${overrides.handle ?? "x"}`);
  const seeded = await seedUserRow(db, { id, handle: castId<Handle>(overrides.handle ?? id) });
  return seeded.id;
}

interface SeedCharacterOverrides {
  readonly id?: string;
  readonly ownerId: UserId;
  readonly name?: string;
  readonly description?: string | null;
  readonly avatarAssetId?: AssetId | null;
}

/** Insert a flat `characters` row (the producer the card embedding + summary FK to). */
export async function seedCharacter(
  db: Db,
  overrides: SeedCharacterOverrides,
): Promise<CharacterId> {
  const id = castId<CharacterId>(overrides.id ?? "character_seed");
  await db.insert(characters).values({
    id,
    handle: id,
    ownerId: overrides.ownerId,
    name: overrides.name ?? "Seed",
    description: overrides.description ?? null,
    contentHash: "seed_content_hash",
    avatarAssetId: overrides.avatarAssetId ?? null,
    createdAt: FROZEN_AT,
  });
  return id;
}

interface SeedCharacterEmbeddingOverrides {
  readonly id?: string;
  readonly characterId: CharacterId;
  readonly embedding: Float32Array;
  readonly hubScore?: number | null;
  readonly model?: string;
  readonly contentHash?: string;
}

/** Insert a `character_embeddings` row (the card-space vector `knn` scans). */
export async function seedCharacterEmbedding(
  db: Db,
  overrides: SeedCharacterEmbeddingOverrides,
): Promise<CharacterEmbeddingId> {
  const id = castId<CharacterEmbeddingId>(
    overrides.id ?? `character_embedding_${overrides.characterId}`,
  );
  await db.insert(characterEmbeddings).values({
    id,
    characterId: overrides.characterId,
    embedding: overrides.embedding,
    contentHash: overrides.contentHash ?? "embed_content_hash",
    hubScore: overrides.hubScore ?? null,
    model: overrides.model ?? EMBED_MODEL,
    dim: VECTOR_DIM,
    createdAt: FROZEN_AT,
  });
  return id;
}

interface SeedCharacterSummaryOverrides {
  readonly characterId: CharacterId;
  readonly genre?: string | null;
  readonly tone?: string | null;
  readonly elevatorPitch?: string | null;
}

/** Insert a `character_summaries` row (discovery's distilled facets `findCharacters` enriches with). */
export async function seedCharacterSummary(
  db: Db,
  overrides: SeedCharacterSummaryOverrides,
): Promise<void> {
  await db.insert(characterSummaries).values({
    characterId: overrides.characterId,
    genre: overrides.genre ?? null,
    tone: overrides.tone ?? null,
    elevatorPitch: overrides.elevatorPitch ?? null,
    model: "test-summary-model",
    computedAt: FROZEN_AT,
  });
}

interface SeedAssetOverrides {
  readonly id?: string;
  readonly ownerId: UserId;
  readonly hash?: string;
}

/** Insert an avatar `assets` row (the CAS hash `findCharacters` surfaces). */
export async function seedAsset(db: Db, overrides: SeedAssetOverrides): Promise<AssetId> {
  const id = castId<AssetId>(overrides.id ?? "asset_a");
  await db.insert(assets).values({
    id,
    ownerId: overrides.ownerId,
    kind: "avatar",
    mime: "image/png",
    size: 1,
    hash: overrides.hash ?? "hash_a",
    uploadedAt: FROZEN_AT,
  });
  return id;
}

/** Insert a `chats` row (the producer FK the digest/segment rows scope to; D18 — no ownerId). */
export async function seedChat(db: Db, id: string): Promise<ChatId> {
  const chatId = castId<ChatId>(id);
  await db.insert(chats).values({ id: chatId, createdAt: FROZEN_AT, updatedAt: FROZEN_AT });
  return chatId;
}

interface SeedDigestOverrides {
  readonly id?: string;
  readonly chatId: ChatId;
  readonly scopedCharacterId: CharacterId;
  readonly tier?: number;
  readonly blockIdx: number;
  readonly text?: string;
  readonly embedding: Float32Array;
  readonly hubScore?: number | null;
  readonly model?: string;
  readonly contentHash?: string;
  readonly keywords?: readonly string[];
}

/** Insert a `chat_digests` row (the distilled lens `digests`/`corpus` scan). */
export async function seedChatDigest(db: Db, o: SeedDigestOverrides): Promise<ChatDigestId> {
  const id = castId<ChatDigestId>(
    o.id ?? `chat_digest_${o.chatId}_${o.scopedCharacterId}_${o.tier ?? 0}_${o.blockIdx}`,
  );
  await db.insert(chatDigests).values({
    id,
    chatId: o.chatId,
    scopedCharacterId: o.scopedCharacterId,
    tier: o.tier ?? 0,
    blockIdx: o.blockIdx,
    text: o.text ?? "digest body",
    embedding: o.embedding,
    contentHash: o.contentHash ?? `digest_hash_${o.chatId}_${o.blockIdx}`,
    hubScore: o.hubScore ?? null,
    keywords: [...(o.keywords ?? [])],
    model: o.model ?? EMBED_MODEL,
    dim: VECTOR_DIM,
    createdAt: FROZEN_AT,
  });
  return id;
}

interface SeedSegmentOverrides {
  readonly id?: string;
  readonly chatId: ChatId;
  readonly blockIdx: number;
  readonly text?: string;
  readonly embedding: Float32Array;
  readonly hubScore?: number | null;
  readonly model?: string;
  readonly contentHash?: string;
}

/** Insert a `chat_segments` row (the verbatim lens `segments`/`corpus` scan). */
export async function seedChatSegment(db: Db, o: SeedSegmentOverrides): Promise<ChatSegmentId> {
  const id = castId<ChatSegmentId>(o.id ?? `chat_segment_${o.chatId}_${o.blockIdx}`);
  await db.insert(chatSegments).values({
    id,
    chatId: o.chatId,
    blockIdx: o.blockIdx,
    seqStart: o.blockIdx * 10,
    seqEnd: o.blockIdx * 10 + 9,
    text: o.text ?? "verbatim transcript",
    embedding: o.embedding,
    contentHash: o.contentHash ?? `segment_hash_${o.chatId}_${o.blockIdx}`,
    hubScore: o.hubScore ?? null,
    model: o.model ?? EMBED_MODEL,
    dim: VECTOR_DIM,
    createdAt: FROZEN_AT,
  });
  return id;
}
