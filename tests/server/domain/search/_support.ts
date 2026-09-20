// Shared test harness for the search domain (NOT a test file — no `.test` suffix, so test-layout ignores
// it). Builds a real-db `SearchContext` with a SCRIPTED `RoleClients` bundle — the sanctioned "fake at the
// edges, inject at the root" doctrine (testing §3): a real injected dep, not an internal-module mock. The
// fake's `embed` maps a query string → a chosen vector (so `vector_distance_cos` picks the seeded
// neighbour deterministically) and its `rerank` is per-test scriptable (custom order, or a rejecting
// not-supported throw). Seeds the rows the verbs read (users / characters / character_embeddings /
// character_summaries / assets) directly — a test fixture may read/seed `users` (the `no-direct-users-read`
// gate scopes only `packages/server/src/domain`).

import type { ImageLens } from "@orb/contracts/embeddings";
import { VECTOR_SCOPES_BY_TASK } from "@orb/contracts/embeddings";
import type { ParticipantRole } from "@orb/contracts/identity";
import type { EmbedResult, ImageEmbedResult, RerankResult, SummarizeResult } from "@orb/contracts/providers";
import type { ImageEmbedInput, RerankDocument, RerankQuery, RoleClients, SummarizeInput } from "@orb/contracts/role-clients";
import type { Db } from "@orb/db";
import {
  assets,
  characterEmbeddings,
  characterSummaries,
  characters,
  chatDigestSpeakers,
  chatDigests,
  chatDocuments,
  chatParticipants,
  chatSegments,
  chats,
  documentChunks,
  documents as documentsTable,
  embedGenerations,
  embedGenerationTargets,
  embedSpaceState,
  globalDocuments,
  imageEmbeddings,
  users,
} from "@orb/db";
import type {
  AssetId,
  CharacterEmbeddingId,
  CharacterHandle,
  CharacterId,
  ChatDigestId,
  ChatId,
  ChatParticipantId,
  ChatSegmentId,
  DocumentChunkId,
  DocumentId,
  Handle,
  ImageEmbeddingId,
  UserConnectionId,
  UserId,
} from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, eq, isNull } from "drizzle-orm";
import { resolveActiveDocumentIds } from "../../../../packages/server/src/domain/databank/persistence/scope.ts";
import type { SearchContext, SearchService } from "../../../../packages/server/src/domain/search/index.ts";
import { createSearchService } from "../../../../packages/server/src/domain/search/index.ts";
import { generationIdOf, vectorSpaceFingerprint } from "../../../../packages/server/src/kit/embedding-generation/index.ts";
import { FROZEN_AT_MS } from "../../../support/clock.ts";
import { makeFakeRoleClients } from "../../../support/factories/role-clients.ts";
import { seedUser as seedUserRow } from "../../../support/factories/user.ts";

const FROZEN_AT = FROZEN_AT_MS;

/** The one 1024-dim space the schema's `F32_BLOB(1024)` columns require. */
const VECTOR_DIM = 1024;
/** The default embed model the harness scopes the scan to (the `(model, dim)` space tag). */
export const EMBED_MODEL = "test-embed-model-1024";
/** The default IMAGE-embed model the harness scopes the cross-modal `images` scan to. */
export const IMAGE_EMBED_MODEL = "test-image-embed-model-1024";

async function seedGeneration(db: Db, ownerId: UserId, task: "embed" | "imageEmbed", model: string): Promise<string> {
  const roleClients = makeSearchRoleClients(task === "embed" ? { embedModel: model } : { imageEmbedModel: model });
  const resolved = await roleClients.resolved(task);
  if (resolved === null) {
    throw new Error(`missing test ${task} connection`);
  }
  const connection = {
    ...resolved,
    connectionId: castId<UserConnectionId>(`connection_${ownerId}_${task}`),
    api: "test",
    wire: "test",
    baseUrl: null,
    features: {},
    extras: null,
    transport: null,
    embed: roleClients.embed,
    imageEmbed: roleClients.imageEmbed,
  } as const;
  const id = generationIdOf({ ownerId, task, via: task, connection, space: model });
  await db
    .insert(embedGenerations)
    .values({
      id,
      ownerId,
      task,
      via: task,
      connectionId: connection.connectionId,
      connectionRef: connection.connectionId,
      fingerprint: vectorSpaceFingerprint(connection),
      space: model,
      createdAt: FROZEN_AT,
    })
    .onConflictDoNothing();
  await db.insert(embedGenerationTargets).values({ ownerId, task, generationId: id, epoch: 1, updatedAt: FROZEN_AT }).onConflictDoNothing();
  await db
    .insert(embedSpaceState)
    .values(
      VECTOR_SCOPES_BY_TASK[task].map((scope) => ({
        ownerId,
        scope,
        activeGenerationId: id,
        candidateGenerationId: null,
        candidateEpoch: null,
        completedAt: FROZEN_AT,
      })),
    )
    .onConflictDoNothing();
  return id;
}

function ownerOf<T extends { ownerId: UserId | null }>(rows: readonly T[], subject: string): UserId {
  const ownerId = rows[0]?.ownerId;
  if (ownerId === undefined || ownerId === null) {
    throw new Error(`missing owner for ${subject}`);
  }
  return ownerId;
}

async function chatOwner(db: Db, chatId: ChatId, model: string): Promise<UserId> {
  const hosts = await db
    .select({ ownerId: chatParticipants.userId })
    .from(chatParticipants)
    .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.kind, "human"), eq(chatParticipants.role, "host"), isNull(chatParticipants.leftSeq)));
  if (hosts[0]?.ownerId !== undefined && hosts[0]?.ownerId !== null) {
    return hosts[0].ownerId;
  }
  const digestOwners = await db
    .select({ ownerId: characters.ownerId })
    .from(chatDigests)
    .innerJoin(characters, eq(chatDigests.scopedCharacterId, characters.id))
    .where(eq(chatDigests.chatId, chatId))
    .limit(1);
  if (digestOwners[0] !== undefined) {
    return digestOwners[0].ownerId;
  }
  const existingUsers = await db.select({ ownerId: users.id }).from(users).limit(1);
  if (existingUsers[0] !== undefined) {
    return existingUsers[0].ownerId;
  }
  const generations = await db
    .select({ ownerId: embedGenerations.ownerId })
    .from(embedGenerations)
    .where(and(eq(embedGenerations.task, "embed"), eq(embedGenerations.space, model)));
  if (generations[0] !== undefined) {
    return generations[0].ownerId;
  }
  const seeded = await seedUserRow(db, {
    id: castId<UserId>("user_search_vector_fixture"),
    handle: castId<Handle>("search-vector-fixture"),
  });
  return seeded.id;
}

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
  /** Observe every `embed` call's input + opts (the per-task `instruction` a scan conditions with) — the P3
   *  instruction-parity proof reads the `instruction` off here. Side-effect-only; never changes the vector. */
  readonly onEmbed?: (input: string | string[], opts?: { readonly inputType?: "query" | "document"; readonly instruction?: string }) => void;
  /** Map the text→image query string → its embedding in the IMAGE space (null = empty-query path). Only
   *  the `kind: "text"` cross-modal path is exercised by the `images` verb. */
  readonly imageEmbedVector?: (input: string) => Float32Array<ArrayBuffer> | null;
  /** The rerank impl — default returns documents in their incoming order (descending score). Override to
   *  script a custom reorder, or to reject with a not-supported throw (PD-11). */
  readonly rerank?: RoleClients["rerank"];
  /** The WHOLE embed impl — the twin of `rerank` above, for the arms where the embed role FAILS rather than
   *  returns a vector (#1603: a side-role 401 on a key the chat connection never saw). `embedVector` cannot
   *  express that: it is a sync vector factory the default impl resolves around. */
  readonly embed?: RoleClients["embed"];
  readonly embedModel?: string;
  readonly imageEmbedModel?: string;
}

/** A scripted `RoleClients` — only `embed` / `rerank` matter to search; the other roles are never called
 *  in the W2 core (typed stubs so the bundle satisfies the interface). */
function makeSearchRoleClients(controls: FakeRoleClientControls = {}): RoleClients {
  const embedModel = controls.embedModel ?? EMBED_MODEL;
  const imageEmbedModel = controls.imageEmbedModel ?? IMAGE_EMBED_MODEL;
  const embedVector = controls.embedVector ?? ((): Float32Array<ArrayBuffer> => vec(1));
  const imageEmbedVector = controls.imageEmbedVector ?? ((): Float32Array<ArrayBuffer> => vec(1));

  const rerank: RoleClients["rerank"] =
    controls.rerank ??
    ((_query: RerankQuery, documents: RerankDocument[]): Promise<RerankResult> =>
      Promise.resolve({
        hits: documents.map((d, i) => ({ id: d.id, score: documents.length - i })),
        model: "test-rerank-model",
        usage: { totalTokens: null },
      }));

  const embed: RoleClients["embed"] =
    controls.embed ??
    ((input: string | readonly string[], opts?: { inputType?: "query" | "document"; instruction?: string }): Promise<EmbedResult> => {
      controls.onEmbed?.(typeof input === "string" ? input : [...input], opts);
      const inputs = typeof input === "string" ? [input] : [...input];
      return Promise.resolve({
        vectors: inputs.map((t) => embedVector(t)),
        model: embedModel,
        usage: { promptTokens: null, totalTokens: null },
      });
    });

  const imageEmbed = (req: ImageEmbedInput): Promise<ImageEmbedResult> => {
    // Only the cross-modal text→image path (`kind: "text"`) is exercised by `images`.
    const texts = req.kind === "text" && !Array.isArray(req.input) ? [req.input] : [];
    return Promise.resolve({
      vectors: texts.map((t) => imageEmbedVector(t)),
      model: imageEmbedModel,
    });
  };
  const summarize = (_inputs: readonly SummarizeInput[]): Promise<SummarizeResult> => Promise.resolve({ items: [], model: "test-summarize-model" });
  return makeFakeRoleClients({
    embed,
    rerank,
    imageEmbed,
    summarize,
    structured: summarize,
    embedDim: VECTOR_DIM,
    embedModel,
    imageEmbedModel,
  });
}

/** Build the search service over a real db + a scripted role-clients bundle + the frozen clock. `now` is
 *  overridable so the lexical-index TTL-freshness path can be exercised deterministically. */
export function makeSearch(db: Db, controls?: FakeRoleClientControls, now: () => number = (): number => FROZEN_AT_MS): SearchService {
  // The REAL databank scope resolver, bound to the db — the honest wiring the compose root uses, so the
  // `documents` lens's scope gating (the gate-8 leak test) is exercised end-to-end over real junctions.
  const roleClients = makeSearchRoleClients(controls);
  const ctx: SearchContext = {
    db,
    roleClientsFor: () => Promise.resolve(roleClients),
    resolveEmbeddingConnection: async (ownerId, task) => {
      const resolved = await roleClients.resolved(task);
      return resolved === null
        ? null
        : {
            ...resolved,
            connectionId: castId<UserConnectionId>(`connection_${ownerId}_${task}`),
            api: "test",
            wire: "test",
            baseUrl: null,
            features: {},
            extras: null,
            transport: null,
            embed: roleClients.embed,
            imageEmbed: roleClients.imageEmbed,
          };
    },
    now,
    resolveActiveDocumentIds: (scope) => resolveActiveDocumentIds(db, scope),
  };
  return createSearchService(ctx);
}

interface SeedDocumentOverrides {
  readonly id?: string;
  readonly ownerId: UserId;
  readonly name?: string;
}

/** Insert a `documents` row (the databank canon producer + the `document_chunks` FK parent). */
export async function seedDocument(db: Db, o: SeedDocumentOverrides): Promise<DocumentId> {
  const id = castId<DocumentId>(o.id ?? `document_${o.ownerId}`);
  await db.insert(documentsTable).values({
    id,
    ownerId: o.ownerId,
    name: o.name ?? "Doc",
    origin: "text",
    mime: "text/markdown",
    extractedText: "",
    byteSize: 0,
    importHash: `import_${id}`,
    extractorVersion: "test-1",
    createdAt: FROZEN_AT,
    updatedAt: FROZEN_AT,
  });
  return id;
}

interface SeedDocumentChunkOverrides {
  readonly id?: string;
  readonly documentId: DocumentId;
  readonly chunkIdx: number;
  readonly content?: string;
  readonly embedding: Float32Array;
  readonly contentHash?: string;
  readonly hubScore?: number | null;
  readonly model?: string;
}

/** Insert a `document_chunks` row (the databank RAG lens the `documents` verb scans). */
export async function seedDocumentChunk(db: Db, o: SeedDocumentChunkOverrides): Promise<DocumentChunkId> {
  const id = castId<DocumentChunkId>(o.id ?? `document_chunk_${o.documentId}_${o.chunkIdx}`);
  const model = o.model ?? EMBED_MODEL;
  const ownerId = ownerOf(await db.select({ ownerId: documentsTable.ownerId }).from(documentsTable).where(eq(documentsTable.id, o.documentId)), o.documentId);
  const generationId = await seedGeneration(db, ownerId, "embed", model);
  await db.insert(documentChunks).values({
    id,
    documentId: o.documentId,
    chunkIdx: o.chunkIdx,
    content: o.content ?? `chunk ${o.chunkIdx}`,
    charStart: o.chunkIdx * 100,
    charEnd: o.chunkIdx * 100 + 99,
    embedding: o.embedding,
    contentHash: o.contentHash ?? `chunk_hash_${o.documentId}_${o.chunkIdx}`,
    hubScore: o.hubScore ?? null,
    model,
    generationId,
    dim: VECTOR_DIM,
    createdAt: FROZEN_AT,
  });
  return id;
}

/** Attach a document to the owner's GLOBAL bank (feeds any chat this owner hosts). */
export async function seedGlobalDocument(db: Db, ownerId: UserId, documentId: DocumentId): Promise<void> {
  await db.insert(globalDocuments).values({ ownerId, documentId });
}

/** Attach a document directly to one chat (feeds only that chat's prompts). */
export async function seedChatDocument(db: Db, chatId: ChatId, documentId: DocumentId): Promise<void> {
  await db.insert(chatDocuments).values({ chatId, documentId });
}

/** Seat a user in a chat with a role (the `{chatId}` scope resolver reads role='host', leftSeq NULL). */
export async function seedChatParticipant(db: Db, chatId: ChatId, userId: UserId, role: ParticipantRole = "host"): Promise<void> {
  await db.insert(chatParticipants).values({
    id: castId<ChatParticipantId>(`chatpart_${chatId}_${userId}`),
    chatId,
    kind: "human",
    userId,
    role,
    joinSeq: 0,
  });
}

interface SeedUserOverrides {
  readonly id?: string;
  readonly handle?: Handle;
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
  /** The hidden group-memory identity (`__group__<chatId>`) — excluded from `discover`/`similarArt` credit. */
  readonly synthetic?: boolean;
}

/** Insert a flat `characters` row (the producer the card embedding + summary FK to). */
export async function seedCharacter(db: Db, overrides: SeedCharacterOverrides): Promise<CharacterId> {
  const id = castId<CharacterId>(overrides.id ?? "character_seed");
  await db.insert(characters).values({
    id,
    handle: castId<CharacterHandle>(id),
    ownerId: overrides.ownerId,
    name: overrides.name ?? "Seed",
    description: overrides.description ?? null,
    synthetic: overrides.synthetic ?? false,
    contentHash: "seed_content_hash",
    avatarAssetId: overrides.avatarAssetId ?? null,
    createdAt: FROZEN_AT,
  });
  return id;
}

/** Insert a `chat_digest_speakers` row (a digest CONTAINS this character — the co-star credit join
 *  `resolveSegmentDisplay` expands for group blocks). */
export async function seedChatDigestSpeaker(db: Db, digestId: ChatDigestId, characterId: CharacterId): Promise<void> {
  await db.insert(chatDigestSpeakers).values({ digestId, characterId });
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
export async function seedCharacterEmbedding(db: Db, overrides: SeedCharacterEmbeddingOverrides): Promise<CharacterEmbeddingId> {
  const id = castId<CharacterEmbeddingId>(overrides.id ?? `character_embedding_${overrides.characterId}`);
  const model = overrides.model ?? EMBED_MODEL;
  const ownerId = ownerOf(
    await db.select({ ownerId: characters.ownerId }).from(characters).where(eq(characters.id, overrides.characterId)),
    overrides.characterId,
  );
  const generationId = await seedGeneration(db, ownerId, "embed", model);
  await db.insert(characterEmbeddings).values({
    id,
    characterId: overrides.characterId,
    embedding: overrides.embedding,
    contentHash: overrides.contentHash ?? "embed_content_hash",
    hubScore: overrides.hubScore ?? null,
    model,
    generationId,
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
export async function seedCharacterSummary(db: Db, overrides: SeedCharacterSummaryOverrides): Promise<void> {
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

interface SeedImageEmbeddingOverrides {
  readonly id?: string;
  readonly assetId: AssetId;
  readonly embedding: Float32Array;
  readonly lens?: ImageLens;
  readonly caption?: string | null;
  readonly hubScore?: number | null;
  readonly model?: string;
  readonly contentHash?: string;
}

/** Insert an `image_embeddings` row (the cross-modal lens the `images` verb scans; D34 lens axis). */
export async function seedImageEmbedding(db: Db, o: SeedImageEmbeddingOverrides): Promise<ImageEmbeddingId> {
  const lens: ImageLens = o.lens ?? "image-captioned";
  const id = castId<ImageEmbeddingId>(o.id ?? `image_embedding_${o.assetId}_${lens}`);
  const model = o.model ?? IMAGE_EMBED_MODEL;
  const ownerId = ownerOf(await db.select({ ownerId: assets.ownerId }).from(assets).where(eq(assets.id, o.assetId)), o.assetId);
  const generationId = await seedGeneration(db, ownerId, "imageEmbed", model);
  await db.insert(imageEmbeddings).values({
    id,
    assetId: o.assetId,
    embedding: o.embedding,
    lens,
    caption: o.caption ?? null,
    contentHash: o.contentHash ?? `image_hash_${o.assetId}`,
    hubScore: o.hubScore ?? null,
    model,
    generationId,
    dim: VECTOR_DIM,
    createdAt: FROZEN_AT,
  });
  return id;
}

/** Insert a `chats` row (the producer FK the digest/segment rows scope to; D18 — no ownerId). */
/** `title` is what the room was NAMED; omit it for an unnamed room (the column is nullable and an
 *  un-renamed room stores the empty string as often as null — both are "unnamed" to a reader). */
export async function seedChat(db: Db, id: string, title?: string): Promise<ChatId> {
  const chatId = castId<ChatId>(id);
  await db.insert(chats).values({ id: chatId, title: title ?? null, createdAt: FROZEN_AT, updatedAt: FROZEN_AT });
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
  const id = castId<ChatDigestId>(o.id ?? `chat_digest_${o.chatId}_${o.scopedCharacterId}_${o.tier ?? 0}_${o.blockIdx}`);
  const model = o.model ?? EMBED_MODEL;
  const ownerId = ownerOf(await db.select({ ownerId: characters.ownerId }).from(characters).where(eq(characters.id, o.scopedCharacterId)), o.scopedCharacterId);
  const generationId = await seedGeneration(db, ownerId, "embed", model);
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
    model,
    generationId,
    dim: VECTOR_DIM,
    createdAt: FROZEN_AT,
  });
  return id;
}

interface SeedSegmentOverrides {
  readonly id?: string;
  readonly chatId: ChatId;
  readonly blockIdx: number;
  /** The chunk within the block (#172) — defaults to 0, the single-chunk case. A multi-chunk block is what
   *  the verbatim scan's collapse-to-best-chunk behaviour is asserted against. */
  readonly chunkIdx?: number;
  readonly text?: string;
  readonly embedding: Float32Array;
  readonly hubScore?: number | null;
  readonly model?: string;
  readonly contentHash?: string;
}

/** Insert a `chat_segments` row (the verbatim lens `segments`/`corpus` scan). */
export async function seedChatSegment(db: Db, o: SeedSegmentOverrides): Promise<ChatSegmentId> {
  const chunkIdx = o.chunkIdx ?? 0;
  const id = castId<ChatSegmentId>(o.id ?? `chat_segment_${o.chatId}_${o.blockIdx}_${chunkIdx}`);
  const model = o.model ?? EMBED_MODEL;
  const generationId = await seedGeneration(db, await chatOwner(db, o.chatId, model), "embed", model);
  await db.insert(chatSegments).values({
    id,
    chatId: o.chatId,
    blockIdx: o.blockIdx,
    chunkIdx,
    seqStart: o.blockIdx * 10,
    seqEnd: o.blockIdx * 10 + 9,
    text: o.text ?? "verbatim transcript",
    embedding: o.embedding,
    contentHash: o.contentHash ?? `segment_hash_${o.chatId}_${o.blockIdx}_${chunkIdx}`,
    hubScore: o.hubScore ?? null,
    model,
    generationId,
    dim: VECTOR_DIM,
    createdAt: FROZEN_AT,
  });
  return id;
}
