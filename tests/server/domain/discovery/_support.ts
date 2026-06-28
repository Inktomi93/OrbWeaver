// Shared test harness for the discovery domain (NOT a test file — no `.test` suffix, so test-layout ignores
// it). Builds a real-db `DiscoveryContext` with the injected determinism seam (seeded ids + a frozen clock),
// a SCRIPTED `summarize` thunk, and a RECORDING `writeHubScores` fake — the sanctioned "fake at the edges,
// inject at the root" doctrine (testing §3): real injected deps, not internal-module mocks. Seeds the rows
// the verbs read directly (users / characters / character_embeddings / chats / chat_participants /
// chat_digests / chat_segments / assets / image_embeddings).

import type { Db } from "@orb/db";
import {
  assets,
  characterEmbeddings,
  characters,
  chatDigests,
  chatParticipants,
  chatSegments,
  chats,
  imageEmbeddings,
  users,
} from "@orb/db";
import type {
  AssetId,
  CharacterId,
  ChatId,
  ChatParticipantId,
  DuplicateCharacterPairId,
  Handle,
  ImageEmbeddingId,
  ThemeClusterId,
  UserId,
} from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { DiscoveryContext } from "../../../../packages/server/src/domain/discovery/index.ts";

/** The injected `writeHubScores` op type (not re-exported from the front door — derive it from the ctx). */
type WriteHubScores = DiscoveryContext["writeHubScores"];

/** A fixed epoch-ms (the frozen clock instant — stable timestamp assertions). */
export const FROZEN_AT = 1_750_000_000_000;
/** The one 1024-dim space the schema's `F32_BLOB(1024)` columns require. */
export const VECTOR_DIM = 1024;
/** The default embed model the seeders tag rows with (the `(model)` space tag). */
export const EMBED_MODEL = "test-embed-model-1024";

/** Build a 1024-dim vector with the given leading components (rest zero) — enough for deterministic cosine
 *  (e.g. `vec(1)` vs `vec(0, 1)` orthogonal; `vec(1)` matches `vec(1)` exactly). */
export function vec(...components: readonly number[]): Float32Array {
  const v = new Float32Array(VECTOR_DIM);
  for (let i = 0; i < components.length; i += 1) {
    v[i] = components[i] ?? 0;
  }
  return v;
}

// ── injected-fake controls ────────────────────────────────────────────────────

/** A recording `writeHubScores` fake: captures each `{ table, updates }` call and reports rows "updated". */
export interface HubScoreRecorder {
  readonly op: WriteHubScores;
  readonly calls: { table: string; updates: { id: string; model: string; hubScore: number }[] }[];
}

export function makeHubScoreRecorder(): HubScoreRecorder {
  const calls: { table: string; updates: { id: string; model: string; hubScore: number }[] }[] = [];
  const op: WriteHubScores = (params) => {
    calls.push({
      table: params.table,
      updates: params.updates.map((u) => ({ id: u.id, model: u.model, hubScore: u.hubScore })),
    });
    return Promise.resolve({ rowsUpdated: params.updates.length });
  };
  return { op, calls };
}

/** A scripted `summarize` — returns each input's name from `names` in order (default a fixed label). Records
 *  the inputs so a test can assert the naming pass fired. */
export interface SummarizeRecorder {
  readonly op: DiscoveryContext["summarize"];
  readonly calls: { systemPrompt: string; userPrompt: string }[][];
}

export function makeSummarizeRecorder(names: readonly string[] = []): SummarizeRecorder {
  const calls: { systemPrompt: string; userPrompt: string }[][] = [];
  const op: DiscoveryContext["summarize"] = (inputs) => {
    calls.push(inputs.map((i) => ({ systemPrompt: i.systemPrompt, userPrompt: i.userPrompt })));
    return Promise.resolve({
      items: inputs.map((_input, idx) => ({
        text: names[idx] ?? `Theme ${idx}`,
        usage: { tokensIn: null, tokensOut: null, costUsd: null },
      })),
      model: "test-summarize-model",
    });
  };
  return { op, calls };
}

/** A seeded id minter (counter-backed; deterministic) for a given prefix. */
function seededMinter<T extends string>(prefix: string): () => T {
  let n = 0;
  return (): T => {
    n += 1;
    return castId<T>(`${prefix}_${String(n).padStart(6, "0")}`);
  };
}

export interface DiscoveryHarness {
  readonly ctx: DiscoveryContext;
  readonly hubScores: HubScoreRecorder;
  readonly summarize: SummarizeRecorder;
}

/** Build a `DiscoveryContext` over a real db with seeded ids + a frozen clock + the injected fakes. */
export function makeDiscoveryHarness(
  db: Db,
  overrides: { readonly summarize?: SummarizeRecorder; readonly hubScores?: HubScoreRecorder } = {},
): DiscoveryHarness {
  const hubScores = overrides.hubScores ?? makeHubScoreRecorder();
  const summarize = overrides.summarize ?? makeSummarizeRecorder();
  const ctx: DiscoveryContext = {
    db,
    now: () => FROZEN_AT,
    newDuplicateCharacterPairId: seededMinter<DuplicateCharacterPairId>("duplicate_character_pair"),
    newThemeClusterId: seededMinter<ThemeClusterId>("theme_cluster"),
    summarize: summarize.op,
    writeHubScores: hubScores.op,
  };
  return { ctx, hubScores, summarize };
}

// ── seeders (insert the rows the verbs read directly) ─────────────────────────

export async function seedUser(db: Db, id = "user_owner"): Promise<UserId> {
  const userId = castId<UserId>(id);
  await db.insert(users).values({
    id: userId,
    handle: castId<Handle>(id),
    role: "user",
    enabled: true,
    passwordHash: null,
    createdAt: FROZEN_AT,
    updatedAt: FROZEN_AT,
  });
  return userId;
}

export async function seedCharacter(
  db: Db,
  overrides: {
    readonly id: string;
    readonly ownerId: UserId;
    readonly name?: string;
    readonly synthetic?: boolean;
  },
): Promise<CharacterId> {
  const id = castId<CharacterId>(overrides.id);
  await db.insert(characters).values({
    id,
    handle: overrides.id,
    ownerId: overrides.ownerId,
    name: overrides.name ?? overrides.id,
    contentHash: "card_hash",
    synthetic: overrides.synthetic ?? false,
    createdAt: FROZEN_AT,
  });
  return id;
}

export async function seedCharacterEmbedding(
  db: Db,
  overrides: {
    readonly characterId: CharacterId;
    readonly embedding: Float32Array;
    readonly model?: string;
    readonly contentHash?: string;
    readonly hubScore?: number | null;
  },
): Promise<void> {
  await db.insert(characterEmbeddings).values({
    id: castId(`character_embedding_${overrides.characterId}`),
    characterId: overrides.characterId,
    embedding: overrides.embedding,
    contentHash: overrides.contentHash ?? `hash_${overrides.characterId}`,
    hubScore: overrides.hubScore ?? null,
    model: overrides.model ?? EMBED_MODEL,
    dim: VECTOR_DIM,
    createdAt: FROZEN_AT,
  });
}

export async function seedChat(db: Db, id: string): Promise<ChatId> {
  const chatId = castId<ChatId>(id);
  await db.insert(chats).values({ id: chatId, createdAt: FROZEN_AT, updatedAt: FROZEN_AT });
  return chatId;
}

/** Seed a chat with its human host participant (the digest→chat→host owner derivation). */
export async function seedHostedChat(db: Db, id: string, ownerId: UserId): Promise<ChatId> {
  const chatId = await seedChat(db, id);
  await db.insert(chatParticipants).values({
    id: castId<ChatParticipantId>(`chat_participant_${id}`),
    chatId,
    kind: "human",
    userId: ownerId,
    role: "host",
    joinSeq: 0,
    joinedAt: FROZEN_AT,
  });
  return chatId;
}

export async function seedChatDigest(
  db: Db,
  overrides: {
    readonly id: string;
    readonly chatId: ChatId;
    readonly embedding: Float32Array;
    readonly tier?: number;
    readonly blockIdx?: number;
    readonly isGroup?: boolean;
    readonly model?: string;
    readonly contentHash?: string;
    readonly keywords?: string[];
  },
): Promise<void> {
  await db.insert(chatDigests).values({
    id: castId(overrides.id),
    chatId: overrides.chatId,
    scopedCharacterId: "",
    isGroup: overrides.isGroup ?? false,
    tier: overrides.tier ?? 0,
    blockIdx: overrides.blockIdx ?? 0,
    embedding: overrides.embedding,
    contentHash: overrides.contentHash ?? `hash_${overrides.id}`,
    keywords: overrides.keywords ?? [],
    model: overrides.model ?? EMBED_MODEL,
    dim: VECTOR_DIM,
    createdAt: FROZEN_AT,
  });
}

export async function seedChatSegment(
  db: Db,
  overrides: {
    readonly id: string;
    readonly chatId: ChatId;
    readonly embedding: Float32Array;
    readonly blockIdx?: number;
    readonly model?: string;
    readonly contentHash?: string;
  },
): Promise<void> {
  await db.insert(chatSegments).values({
    id: castId(overrides.id),
    chatId: overrides.chatId,
    blockIdx: overrides.blockIdx ?? 0,
    seqStart: 0,
    seqEnd: 1,
    embedding: overrides.embedding,
    contentHash: overrides.contentHash ?? `hash_${overrides.id}`,
    model: overrides.model ?? EMBED_MODEL,
    dim: VECTOR_DIM,
    createdAt: FROZEN_AT,
  });
}

export async function seedAsset(db: Db, id: string, ownerId: UserId): Promise<AssetId> {
  const assetId = castId<AssetId>(id);
  await db.insert(assets).values({
    id: assetId,
    ownerId,
    kind: "avatar",
    mime: "image/png",
    size: 1,
    hash: `cas_${id}`,
    uploadedAt: FROZEN_AT,
  });
  return assetId;
}

export async function seedImageEmbedding(
  db: Db,
  overrides: {
    readonly id: string;
    readonly assetId: AssetId;
    readonly embedding: Float32Array;
    readonly model?: string;
    readonly contentHash?: string;
  },
): Promise<void> {
  await db.insert(imageEmbeddings).values({
    id: castId<ImageEmbeddingId>(overrides.id),
    assetId: overrides.assetId,
    embedding: overrides.embedding,
    lens: "image-raw",
    contentHash: overrides.contentHash ?? `hash_${overrides.id}`,
    model: overrides.model ?? EMBED_MODEL,
    dim: VECTOR_DIM,
    createdAt: FROZEN_AT,
  });
}
