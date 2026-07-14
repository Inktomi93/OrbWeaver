// Shared test harness for the chat `memory/` subsystem (NOT a test file — no `.test` suffix). Seeds the
// embeddings-owned chat_digests / chat_segments / chat_digest_speakers rows memory READS, and provides the
// injected fakes (summarize / embeddingsStore / searchDigests) the build + recall close over. The digest/
// segment rows carry a dummy F32_BLOB(1024) embedding (memory never reads the vector column — only the facets).

import type { SummarizeResult } from "@orb/contracts/providers";
import type { BlockKey, MemoryQueryOptions } from "@orb/contracts/search";
import type { Db } from "@orb/db";
import { chatDigestSpeakers, chatDigests, chatSegments } from "@orb/db";
import type { CharacterId, ChatDigestId, ChatId, ChatSegmentId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type {
  EmbeddingsStoreOp,
  StoreDigestParams,
  StoreSegmentParams,
} from "../../../../../packages/server/src/domain/chat/contract/context";
import type { MemoryScope } from "../../../../../packages/server/src/domain/chat/memory/types";
import { seedMessage } from "../_support";

export const MODEL = "test-embed-1024";
const DIM = 1024;

/** The synthetic group-as-character id (`scopedCharacterId` for the shared bucket — inv 8, no `''` sentinel).
 *  A FK-valid character row must be seeded (`seedCharacter(db, owner, "group")`) before seeding shared digests. */
export const GROUP_CHAR = castId<CharacterId>("character_group");

/** Seed `n` assistant messages (seq 1..n) voiced by `characterId` — byte-identical across build/segments,
 *  build/digests (both closed over module-level `db`/`aria`; hoisted to take both as params). */
export async function seedTurns(
  db: Db,
  chatId: ChatId,
  characterId: CharacterId,
  n: number,
): Promise<void> {
  for (let seq = 1; seq <= n; seq += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: ordered seed inserts in a test.
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
  },
): Promise<ChatDigestId> {
  const scoped = opts.scopedCharacterId ?? GROUP_CHAR;
  const id = castId<ChatDigestId>(
    `chat_digest_${opts.chatId}_${scoped}_${opts.tier}_${opts.blockIdx}`,
  );
  const anchor = opts.topicAnchor ?? `[anchor ${opts.tier}.${opts.blockIdx}]`;
  const keywords = opts.keywords ?? [`kw${opts.tier}${opts.blockIdx}`];
  // Default the stored `text` to the facet-shaped body `{{memory}}` surfaces (anchor [+ keywords]) — so a seed
  // that sets only anchor/keywords produces the matching `{{memory}}` text (the §2b distilled body). With no
  // keywords it is the bare anchor (mirrors the `facet()` helper the recall tests assert against).
  const text =
    opts.text ?? (keywords.length > 0 ? `${anchor}\nkeywords: ${keywords.join(", ")}` : anchor);
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
    dim: DIM,
  });
  const speakers = opts.speakers ?? [];
  if (speakers.length > 0) {
    await db
      .insert(chatDigestSpeakers)
      .values(speakers.map((characterId) => ({ digestId: id, characterId })));
  }
  return id;
}

/** Seed a `chat_segments` row. */
export async function seedSegment(
  db: Db,
  opts: {
    readonly chatId: ChatId;
    readonly blockIdx: number;
    readonly seqStart: number;
    readonly seqEnd: number;
    readonly text?: string;
    readonly contentHash?: string;
  },
): Promise<ChatSegmentId> {
  const id = castId<ChatSegmentId>(`chat_segment_${opts.chatId}_${opts.blockIdx}`);
  await db.insert(chatSegments).values({
    id,
    chatId: opts.chatId,
    blockIdx: opts.blockIdx,
    seqStart: opts.seqStart,
    seqEnd: opts.seqEnd,
    text: opts.text ?? `verbatim block ${opts.blockIdx}`,
    embedding: dummyVector(),
    contentHash: opts.contentHash ?? `seg_${opts.blockIdx}`,
    model: MODEL,
    dim: DIM,
  });
  return id;
}

/** A deterministic fake `summarize` that echoes the input into a well-formed three-part digest + records the
 *  calls. The digest anchor encodes the input length so different blocks yield different digests. */
export function fakeSummarize(): {
  fn: (inputs: { systemPrompt: string; userPrompt: string }[]) => Promise<SummarizeResult>;
  calls: { systemPrompt: string; userPrompt: string }[];
} {
  const calls: { systemPrompt: string; userPrompt: string }[] = [];
  const fn = (inputs: { systemPrompt: string; userPrompt: string }[]): Promise<SummarizeResult> => {
    const input = inputs.at(0) ?? { systemPrompt: "", userPrompt: "" };
    calls.push(input);
    const text = `[entities — scene ${calls.length}]\nFacts about turn ${calls.length}.\nkeywords: alpha, beta, gamma`;
    return Promise.resolve({
      items: [{ text, usage: { tokensIn: 1, tokensOut: 1, costUsd: null } }],
      model: MODEL,
    });
  };
  return { fn, calls };
}

/** A fake `embeddingsStore` that RECORDS every call AND actually inserts the row (digest or segment) — so a
 *  build pass's consolidation can read back the tier-0 rows it just wrote (mirrors the real store's persist). */
export function fakeEmbeddingsStore(db: Db): {
  store: EmbeddingsStoreOp;
  digests: StoreDigestParams[];
  segments: StoreSegmentParams[];
} {
  const digests: StoreDigestParams[] = [];
  const segments: StoreSegmentParams[] = [];
  const store: EmbeddingsStoreOp = async (params) => {
    if (params.lens === "digest") {
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
      });
    } else {
      segments.push(params);
      await seedSegment(db, {
        chatId: params.chatId,
        blockIdx: params.blockIdx,
        seqStart: params.seqStart,
        seqEnd: params.seqEnd,
        text: params.text,
        contentHash: params.contentHash,
      });
    }
  };
  return { store, digests, segments };
}

/** A fake `searchDigests` that records the `MemoryQueryOptions` + returns a fixed key list (the injected
 *  cosine scan; `queryText`/`scopedCharacterId`/`candidates` are now homed on the options — inv 8). */
export function fakeSearchDigests(result: readonly BlockKey[]): {
  fn: (query: MemoryQueryOptions) => Promise<readonly BlockKey[]>;
  calls: MemoryQueryOptions[];
} {
  const calls: MemoryQueryOptions[] = [];
  const fn = (query: MemoryQueryOptions): Promise<readonly BlockKey[]> => {
    calls.push(query);
    return Promise.resolve(result);
  };
  return { fn, calls };
}
