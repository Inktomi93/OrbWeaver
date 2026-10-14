import type { ChatId, IdSource } from "@orb/kit/ids";
import { createIdSource, ID_PREFIX } from "@orb/kit/ids";
import { createSeededIds } from "../iso/ids.ts";
import type { TrpcWireOutput } from "./route-trpc.ts";

type Search = TrpcWireOutput<"search.search">;
type Digest = Extract<Search, { over: "digests" }>["hits"][number];
type Scene = Extract<Search, { over: "discover" }>["hits"][number]["segments"][number];

const GENERATION = "a".repeat(64);
const FINGERPRINT = "b".repeat(64);
const CONTENT_HASH = "c".repeat(64);
const SOURCE_SEQ_START = 1201;
const SOURCE_SEQ_END = 1202;
const ids = createIdSource(createSeededIds().next);

export function corpusDigestSource(blockKey: Digest["blockKey"], source: IdSource = ids): Extract<Digest["source"], { kind: "digest" }> {
  return {
    kind: "digest",
    rowId: source.typeId(ID_PREFIX.chatDigest),
    ...blockKey,
    generationId: GENERATION,
    fingerprint: FINGERPRINT,
    contentHash: CONTENT_HASH,
    seqStart: SOURCE_SEQ_START,
    seqEnd: SOURCE_SEQ_END,
    messageStartId: source.typeId(ID_PREFIX.message),
    messageEndId: source.typeId(ID_PREFIX.message),
  };
}

export function corpusSceneSource(chatId: ChatId, blockIdx: number, source: IdSource = ids): Scene["source"] {
  return {
    kind: "segment",
    rowId: source.typeId(ID_PREFIX.chatSegment),
    chatId,
    blockIdx,
    chunkIdx: 0,
    generationId: GENERATION,
    fingerprint: FINGERPRINT,
    contentHash: CONTENT_HASH,
    seqStart: SOURCE_SEQ_START,
    seqEnd: SOURCE_SEQ_END,
    messageStartId: source.typeId(ID_PREFIX.message),
    messageEndId: source.typeId(ID_PREFIX.message),
  };
}

export const CORPUS_PREVIEW_COVERAGE = { requestLimit: 20, candidateLimit: 80, evidencePerCharacter: null, reranked: false } as const;

export function corpusGroupingProvenance(
  baseLabel: string,
): Pick<TrpcWireOutput<"discovery.archetypes">[number], "baseLabel" | "generationId" | "fingerprint" | "passId"> {
  return { baseLabel, generationId: GENERATION, fingerprint: FINGERPRINT, passId: CONTENT_HASH };
}
