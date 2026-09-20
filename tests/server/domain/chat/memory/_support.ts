// Shared test harness for the chat `memory/` subsystem (NOT a test file — no `.test` suffix). Seeds the
// embeddings-owned chat_digests / chat_segments / chat_digest_speakers rows memory READS, and provides the
// injected fakes (summarize / embeddingsStore / searchDigests) the build + recall close over. The digest/
// segment rows carry a dummy F32_BLOB(1024) embedding (memory never reads the vector column — only the facets).

import type { ProviderId } from "@orb/contracts/inference";
import type { SummarizeResult } from "@orb/contracts/providers";
import type { SummarizeOptions } from "@orb/contracts/role-clients";
import type { BlockKey, MemoryQueryOptions, ScoredBlock } from "@orb/contracts/search";
import type { Db } from "@orb/db";
import { characters, chatDigestSpeakers, chatDigests, chatParticipants, chatSegments, embedGenerations, userConnections } from "@orb/db";
import type { CharacterId, ChatDigestId, ChatId, ChatSegmentId, EmbedGenerationId, UserConnectionId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, eq, isNull } from "drizzle-orm";
import type {
  EmbeddingsStoreOp,
  EmbeddingsStoreSegmentsOp,
  StoreDigestParams,
  StoreSegmentParams,
  SummarizeOp,
} from "../../../../../packages/server/src/domain/chat/contract/context.ts";
import type { MemoryScope } from "../../../../../packages/server/src/domain/chat/memory/types.ts";
import { seedMessage } from "../_support.ts";

export const MODEL = "test-embed-1024";
const DIM = 1024;

export function testGenerationId(ownerId: UserId): EmbedGenerationId {
  return castId<EmbedGenerationId>(`embed_generation_memory_${ownerId}`);
}

/** The synthetic group-as-character id (`scopedCharacterId` for the shared bucket — inv 8, no `''` sentinel).
 *  A FK-valid character row must be seeded (`seedCharacter(db, owner, "group")`) before seeding shared digests. */
export const GROUP_CHAR = castId<CharacterId>("character_group");

/** Seed `n` assistant messages (seq 1..n) voiced by `characterId` — byte-identical across build/segments,
 *  build/digests (both closed over module-level `db`/`aria`; hoisted to take both as params). */
export async function seedTurns(db: Db, chatId: ChatId, characterId: CharacterId, n: number): Promise<void> {
  for (let seq = 1; seq <= n; seq += 1) {
    await seedMessage(db, chatId, seq, { characterId, content: `turn ${seq}` });
  }
}

/** The shared-bucket `MemoryScope` (group-as-character, non-group flag false) — byte-identical across
 *  build/digests and recall/recall. */
export function sharedScope(chatId: ChatId): MemoryScope {
  return { chatId, scopedCharacterId: GROUP_CHAR, isGroup: false };
}

/** A zeroed F32_BLOB(1024) — memory never reads the vector column, so the value is irrelevant. */
function dummyVector(): Float32Array {
  return new Float32Array(DIM);
}

async function seedGeneration(db: Db, chatId: ChatId, knownOwnerId?: UserId): Promise<EmbedGenerationId> {
  const hosts = await db
    .select({ ownerId: chatParticipants.userId })
    .from(chatParticipants)
    .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.kind, "human"), eq(chatParticipants.role, "host"), isNull(chatParticipants.leftSeq)));
  const ownerId = knownOwnerId ?? (hosts[0]?.ownerId as UserId | null | undefined);
  if (ownerId === undefined || ownerId === null) {
    throw new Error(`missing host for ${chatId}`);
  }
  const id = testGenerationId(ownerId);
  const connectionId = castId<UserConnectionId>(`user_connection_memory_${ownerId}`);
  await db
    .insert(userConnections)
    .values({
      id: connectionId,
      ownerId,
      label: "memory fixture embed",
      providerId: castId<ProviderId>("custom-openai"),
      model: MODEL,
    })
    .onConflictDoNothing();
  await db
    .insert(embedGenerations)
    .values({
      id,
      ownerId,
      task: "embed",
      via: "embed",
      connectionId,
      connectionRef: connectionId,
      fingerprint: `test:embed:${MODEL}`,
      space: MODEL,
    })
    .onConflictDoNothing();
  return id;
}

/** Seed a `chat_digests` row (+ its `chat_digest_speakers` join) — the facets memory recalls. */
export async function seedDigest(
  db: Db,
  opts: {
    readonly chatId: ChatId;
    readonly scopedCharacterId?: CharacterId;
    readonly isGroup?: boolean;
    readonly tier: number;
    readonly blockIdx: number;
    readonly text?: string;
    readonly contentHash?: string;
    readonly topicAnchor?: string;
    readonly keywords?: string[];
    readonly speakers?: CharacterId[];
    readonly ownerId?: UserId;
  },
): Promise<ChatDigestId> {
  const scoped = opts.scopedCharacterId ?? GROUP_CHAR;
  const id = castId<ChatDigestId>(`chat_digest_${opts.chatId}_${scoped}_${opts.tier}_${opts.blockIdx}`);
  const anchor = opts.topicAnchor ?? `[anchor ${opts.tier}.${opts.blockIdx}]`;
  const keywords = opts.keywords ?? [`kw${opts.tier}${opts.blockIdx}`];
  // Default the stored `text` to the facet-shaped body `{{memory}}` surfaces (anchor [+ keywords]) — so a seed
  // that sets only anchor/keywords produces the matching `{{memory}}` text (the §2b distilled body). With no
  // keywords it is the bare anchor (mirrors the `facet()` helper the recall tests assert against).
  const text = opts.text ?? (keywords.length > 0 ? `${anchor}\nkeywords: ${keywords.join(", ")}` : anchor);
  const characterOwners =
    opts.ownerId === undefined ? await db.select({ ownerId: characters.ownerId }).from(characters).where(eq(characters.id, scoped)).limit(1) : [];
  const generationId = await seedGeneration(db, opts.chatId, opts.ownerId ?? characterOwners[0]?.ownerId);
  await db.insert(chatDigests).values({
    id,
    chatId: opts.chatId,
    scopedCharacterId: scoped,
    isGroup: opts.isGroup ?? false,
    tier: opts.tier,
    blockIdx: opts.blockIdx,
    text,
    embedding: dummyVector(),
    contentHash: opts.contentHash ?? `hash_${opts.tier}_${opts.blockIdx}`,
    topicAnchor: anchor,
    keywords,
    model: MODEL,
    generationId,
    dim: DIM,
  });
  const speakers = opts.speakers ?? [];
  if (speakers.length > 0) {
    await db.insert(chatDigestSpeakers).values(speakers.map((characterId) => ({ digestId: id, characterId })));
  }
  return id;
}

/** Seed a `chat_segments` row. */
export async function seedSegment(
  db: Db,
  opts: {
    readonly chatId: ChatId;
    readonly blockIdx: number;
    /** The chunk within the block (#172) — defaults to 0, the single-chunk case. */
    readonly chunkIdx?: number;
    readonly seqStart: number;
    readonly seqEnd: number;
    readonly text?: string;
    readonly contentHash?: string;
    readonly ownerId?: UserId;
  },
): Promise<ChatSegmentId> {
  const chunkIdx = opts.chunkIdx ?? 0;
  const id = castId<ChatSegmentId>(`chat_segment_${opts.chatId}_${opts.blockIdx}_${chunkIdx}`);
  const generationId = await seedGeneration(db, opts.chatId, opts.ownerId);
  await db.insert(chatSegments).values({
    id,
    chatId: opts.chatId,
    blockIdx: opts.blockIdx,
    chunkIdx,
    seqStart: opts.seqStart,
    seqEnd: opts.seqEnd,
    text: opts.text ?? `verbatim block ${opts.blockIdx}`,
    embedding: dummyVector(),
    contentHash: opts.contentHash ?? `seg_${opts.blockIdx}_${chunkIdx}`,
    model: MODEL,
    generationId,
    dim: DIM,
  });
  return id;
}

/** A deterministic fake `summarize` that echoes the input into a well-formed three-part digest + records the
 *  calls. Returns ONE item per input (index-aligned) so a BATCHED call (`inputs.length > 1`) resolves every
 *  slot — the memory build now batches its block/consolidation summarizes. `calls` + `optsSeen` are FLATTENED
 *  (one entry per input across all calls) so the existing "N items summarized" assertions hold regardless of
 *  batching; `batchSizes` records the per-CALL input count (the batching proof — every value is 1 under the
 *  old per-block loop, >1 once a pass batches). `optsSeen` captures the `AppSettings.memorySummarizer` wire. */
export function fakeSummarize(): {
  fn: (inputs: { systemPrompt: string; userPrompt: string }[], opts?: SummarizeOptions) => Promise<SummarizeResult>;
  /** The same fake as the funder-keyed `ChatContext.summarize` op (the funder is ignored — one scripted tape). */
  op: SummarizeOp;
  calls: { systemPrompt: string; userPrompt: string }[];
  optsSeen: (SummarizeOptions | undefined)[];
  batchSizes: number[];
} {
  const calls: { systemPrompt: string; userPrompt: string }[] = [];
  const optsSeen: (SummarizeOptions | undefined)[] = [];
  const batchSizes: number[] = [];
  const fn = (inputs: { systemPrompt: string; userPrompt: string }[], opts?: SummarizeOptions): Promise<SummarizeResult> => {
    batchSizes.push(inputs.length);
    const items = inputs.map((input) => {
      calls.push(input);
      optsSeen.push(opts);
      const text = `[entities — scene ${calls.length}]\nFacts about turn ${calls.length}.\nkeywords: alpha, beta, gamma`;
      return { text, usage: { tokensIn: 1, tokensOut: 1, costUsd: null } };
    });
    return Promise.resolve({ items, model: MODEL });
  };
  const op: SummarizeOp = (_funderUserId, inputs, opts) => fn([...inputs], opts);
  return { fn, op, calls, optsSeen, batchSizes };
}

/** Fakes for the TWO memory vector-write ops that RECORD every call AND actually insert the rows — so a build
 *  pass's consolidation can read back the tier-0 rows it just wrote (mirrors the real store's persist).
 *  `store` is the digest op; `storeSegments` is the BATCH segment op (#172) and records the batch SIZES too,
 *  which is the flood proof (every value is 1 under a per-block loop, one big value once a phase batches). */
export function fakeEmbeddingsStore(db: Db): {
  store: EmbeddingsStoreOp;
  storeSegments: EmbeddingsStoreSegmentsOp;
  digests: StoreDigestParams[];
  segments: StoreSegmentParams[];
  segmentBatchSizes: number[];
} {
  const digests: StoreDigestParams[] = [];
  const segments: StoreSegmentParams[] = [];
  const segmentBatchSizes: number[] = [];
  const store: EmbeddingsStoreOp = async (params) => {
    digests.push(params);
    await seedDigest(db, {
      chatId: params.key.chatId,
      scopedCharacterId: params.key.scopedCharacterId,
      tier: params.key.tier,
      blockIdx: params.key.blockIdx,
      text: params.text,
      contentHash: params.contentHash,
      topicAnchor: params.topicAnchor,
      keywords: [...params.keywords],
      isGroup: params.isGroup,
      speakers: [...params.speakerCharacterIds],
      ownerId: params.ownerId,
    });
    return { ownerId: params.ownerId, model: params.model, generationId: testGenerationId(params.ownerId), generationEpoch: 1 };
  };
  const storeSegments: EmbeddingsStoreSegmentsOp = async (batch) => {
    segmentBatchSizes.push(batch.length);
    for (const params of batch) {
      segments.push(params);
      await seedSegment(db, {
        chatId: params.chatId,
        blockIdx: params.blockIdx,
        chunkIdx: params.chunkIdx,
        seqStart: params.seqStart,
        seqEnd: params.seqEnd,
        text: params.text,
        contentHash: params.contentHash,
        ownerId: params.ownerId,
      });
    }
    return batch.map((params) => ({ ownerId: params.ownerId, model: params.model, generationId: testGenerationId(params.ownerId), generationEpoch: 1 }));
  };
  return { store, storeSegments, digests, segments, segmentBatchSizes };
}

/** A fake `searchDigests` that records the `MemoryQueryOptions` + returns a fixed ranked list (the injected
 *  cosine scan; `queryText`/`scopedCharacterId`/`candidates` are now homed on the options — inv 8). Takes
 *  BARE KEYS for the common case and synthesizes descending scores in the given order — a caller that is
 *  ASSERTING on the trace's numbers (#250) passes full {@link ScoredBlock}s instead. */
export function fakeSearchDigests(result: readonly (BlockKey | ScoredBlock)[]): {
  fn: (query: Omit<MemoryQueryOptions, "ownerId">) => Promise<readonly ScoredBlock[]>;
  calls: Omit<MemoryQueryOptions, "ownerId">[];
} {
  const calls: Omit<MemoryQueryOptions, "ownerId">[] = [];
  const scored: readonly ScoredBlock[] = result.map((r, i) => ("blockKey" in r ? r : { blockKey: r, score: -1 + i * 0.1, relevance: 0.9 - i * 0.1 }));
  const fn = (query: Omit<MemoryQueryOptions, "ownerId">): Promise<readonly ScoredBlock[]> => {
    calls.push(query);
    return Promise.resolve(scored);
  };
  return { fn, calls };
}
