// Wire-output builders for the stats reads (`stats.byModel`, `stats.latency`, `stats.personaUsage`,
// `stats.overview`, `stats.wrapped`). Each default parses through the contract schema, so a new required field
// fails here once; an override is spread after the parse.

import { latencyStatsSchema, modelStatRowSchema, ownerStatsViewSchema, personaUsageRowSchema, wrappedSummarySchema } from "@orb/contracts/stats";
import { ID_PREFIX } from "@orb/kit/ids";
import { FROZEN_AT_MS } from "../../iso/clock.ts";
import { createSeededIds } from "../../iso/ids.ts";
import type { TrpcWireOutput } from "../route-trpc.ts";

const ids = createSeededIds();

type ModelStatRowWire = TrpcWireOutput<"stats.byModel">[number];
type LatencyStatsWire = TrpcWireOutput<"stats.latency">;
type PersonaUsageRowWire = TrpcWireOutput<"stats.personaUsage">[number];
type OwnerStatsWire = NonNullable<TrpcWireOutput<"stats.overview">>;
type WrappedSummaryWire = NonNullable<TrpcWireOutput<"stats.wrapped">>;

/** A model bucket with no recorded generations, tokens or timings. */
export function makeModelStatRow(overrides: Partial<ModelStatRowWire> = {}): ModelStatRowWire {
  return {
    ...modelStatRowSchema.parse({
      model: "model",
      provider: null,
      generations: 0,
      charactersUsedWith: 0,
      tokensIn: null,
      tokensOut: null,
      tokensInProvenance: "unrecorded",
      tokensOutProvenance: "unrecorded",
      totalGenTimeMs: 0,
      avgGenMs: null,
      avgTtftMs: null,
      p50TtftMs: null,
      p90TtftMs: null,
      reasoningRate: null,
      throughputTps: null,
      costUsd: null,
      reasoningMs: 0,
      cacheHitRate: null,
    }),
    ...overrides,
  };
}

/** A latency population with no recorded samples. */
export function makeLatencyStats(overrides: Partial<LatencyStatsWire> = {}): LatencyStatsWire {
  return {
    ...latencyStatsSchema.parse({ avgTtftMs: null, p50TtftMs: null, p90TtftMs: null, avgGenMs: null, p50GenMs: null, p90GenMs: null }),
    ...overrides,
  };
}

/** A persona that has never been used in a chat. */
export function makePersonaUsageRow(overrides: Partial<PersonaUsageRowWire> = {}): PersonaUsageRowWire {
  return {
    ...personaUsageRowSchema.parse({
      personaId: ids.next(ID_PREFIX.persona),
      name: "Persona",
      chatCount: 0,
      messageCount: 0,
      tokensOut: null,
      tokensOutProvenance: "unrecorded",
      lastUsedAt: null,
    }),
    ...overrides,
  };
}

/** An owner's overview with nothing counted. */
export function makeOwnerStats(overrides: Partial<OwnerStatsWire> = {}): OwnerStatsWire {
  return {
    ...ownerStatsViewSchema.parse({
      reasoningMs: 0,
      costUsd: null,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      forkedChats: 0,
      variantMessages: 0,
      maxContextTokens: null,
      throughputTps: 0,
      avgSwipeDepth: 0,
      swipeRate: 0,
      cacheHitRate: null,
      avgReplyWords: 0,
      characters: 0,
      chats: 0,
      userTurns: 0,
      assistantTurns: 0,
      systemTurns: 0,
      swipes: 0,
      userWords: 0,
      assistantWords: 0,
      swipeWords: 0,
      tokensIn: null,
      tokensOut: null,
      tokensInProvenance: "unrecorded",
      tokensOutProvenance: "unrecorded",
      totalGenTimeMs: 0,
      avgGenMs: null,
      p50GenMs: null,
      p90GenMs: null,
      avgTtftMs: null,
      p50TtftMs: null,
      p90TtftMs: null,
      reasoningRate: 0,
      contentChars: 0,
      firstChatAt: null,
      lastActivityAt: null,
      computedAt: FROZEN_AT_MS,
    }),
    ...overrides,
  };
}

/** A wrapped summary with nothing counted. */
export function makeWrappedSummary(overrides: Partial<WrappedSummaryWire> = {}): WrappedSummaryWire {
  return {
    ...wrappedSummarySchema.parse({
      firstChatAt: null,
      lastActivityAt: null,
      characters: 0,
      chats: 0,
      words: 0,
      replies: 0,
      swipes: 0,
      genTimeMs: 0,
      reasoningMs: 0,
      costUsd: null,
      avgSwipeDepth: 0,
      swipeRate: 0,
      throughputTps: 0,
      forkedChats: 0,
      topCharacter: null,
      computedAt: FROZEN_AT_MS,
    }),
    ...overrides,
  };
}
