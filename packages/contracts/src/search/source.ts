import type { EmbedGenerationId } from "@orb/kit/ids";
import { brandedId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";

const SOURCE_CONTENT_HASH_MAX = 256;

const sourceFields = {
  chatId: typeIdSchema(ID_PREFIX.chat),
  generationId: z
    .string()
    .regex(/^[a-f0-9]{64}$/u)
    .pipe(brandedId<EmbedGenerationId>()),
  fingerprint: z
    .string()
    .regex(/^[a-f0-9]{64}$/u)
    .nullable(),
  contentHash: z.string().max(SOURCE_CONTENT_HASH_MAX),
  blockIdx: z.number().int().nonnegative(),
  seqStart: z.number().int().nonnegative().nullable(),
  seqEnd: z.number().int().nonnegative().nullable(),
  messageStartId: typeIdSchema(ID_PREFIX.message).nullable(),
  messageEndId: typeIdSchema(ID_PREFIX.message).nullable(),
};

/** Immutable producer identity retained by a search occurrence across reindexing and transcript edits. */
export const corpusSourceSchema = z.discriminatedUnion("kind", [
  z.object({ ...sourceFields, kind: z.literal("segment"), rowId: typeIdSchema(ID_PREFIX.chatSegment), chunkIdx: z.number().int().nonnegative() }),
  z.object({
    ...sourceFields,
    kind: z.literal("digest"),
    rowId: typeIdSchema(ID_PREFIX.chatDigest),
    tier: z.number().int().nonnegative(),
    scopedCharacterId: typeIdSchema(ID_PREFIX.character),
  }),
]);
export type CorpusSource = z.infer<typeof corpusSourceSchema>;

export const CORPUS_SOURCE_OUTCOMES = ["resolved", "moved", "deleted", "unavailable"] as const;
export type CorpusSourceOutcome = (typeof CORPUS_SOURCE_OUTCOMES)[number];

export const messageWindowTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("source"), source: corpusSourceSchema }),
  z.object({ kind: z.literal("message"), messageId: typeIdSchema(ID_PREFIX.message) }),
]);
export type MessageWindowTarget = z.infer<typeof messageWindowTargetSchema>;

export const messageWindowCursorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("before"), seq: z.number().int().nonnegative() }),
  z.object({ kind: z.literal("after"), seq: z.number().int().nonnegative() }),
]);
export type MessageWindowCursor = z.infer<typeof messageWindowCursorSchema>;

export interface CorpusDigestSource {
  readonly source: Extract<CorpusSource, { kind: "digest" }>;
  readonly text: string;
  readonly chatTitle: string | null;
  readonly scopedCharacterName: string | null;
}

export interface CorpusSourceState {
  readonly generationFingerprint: string | null;
  readonly contentHash: string | null;
  readonly sourceSpanMatches: boolean;
}

/** Canon readers authorize membership before requesting vector-row identity metadata. */
export type ResolveCorpusSourceState = (source: CorpusSource) => Promise<CorpusSourceState>;
