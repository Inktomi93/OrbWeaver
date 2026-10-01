import type { ChatId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { TrpcWireOutput } from "./route-trpc.ts";

type Search = TrpcWireOutput<"search.search">;
type Digest = Extract<Search, { over: "digests" }>["hits"][number];
type Scene = Extract<Search, { over: "discover" }>["hits"][number]["segments"][number];

const GENERATION = "a".repeat(64);
const FINGERPRINT = "b".repeat(64);
const CONTENT_HASH = "c".repeat(64);
const SOURCE_SEQ_START = 1201;
const SOURCE_SEQ_END = 1202;

export function corpusDigestSource(blockKey: Digest["blockKey"]): Extract<Digest["source"], { kind: "digest" }> {
  return {
    kind: "digest",
    rowId: mintTypeId(ID_PREFIX.chatDigest),
    ...blockKey,
    generationId: GENERATION,
    fingerprint: FINGERPRINT,
    contentHash: CONTENT_HASH,
    seqStart: SOURCE_SEQ_START,
    seqEnd: SOURCE_SEQ_END,
    messageStartId: mintTypeId(ID_PREFIX.message),
    messageEndId: mintTypeId(ID_PREFIX.message),
  };
}

export function corpusSceneSource(chatId: ChatId, blockIdx: number): Scene["source"] {
  return {
    kind: "segment",
    rowId: mintTypeId(ID_PREFIX.chatSegment),
    chatId,
    blockIdx,
    chunkIdx: 0,
    generationId: GENERATION,
    fingerprint: FINGERPRINT,
    contentHash: CONTENT_HASH,
    seqStart: SOURCE_SEQ_START,
    seqEnd: SOURCE_SEQ_END,
    messageStartId: mintTypeId(ID_PREFIX.message),
    messageEndId: mintTypeId(ID_PREFIX.message),
  };
}

export const CORPUS_PREVIEW_COVERAGE = { requestLimit: 20, candidateLimit: 80, evidencePerCharacter: null, reranked: false } as const;

export function corpusGroupingProvenance(
  baseLabel: string,
): Pick<TrpcWireOutput<"discovery.archetypes">[number], "baseLabel" | "generationId" | "fingerprint" | "passId"> {
  return { baseLabel, generationId: GENERATION, fingerprint: FINGERPRINT, passId: CONTENT_HASH };
}
