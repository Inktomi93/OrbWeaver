import type { TokenProvenance } from "@orb/contracts/chat";
import type { ProviderId } from "@orb/contracts/inference";
import type { characterStats, dailyStats, modelStats, ownerStats } from "@orb/db";
import type { ModelId } from "@orb/kit/ids";

export interface TokenSampleAccum {
  tokensInMeasuredSamples: number;
  tokensInEstimatedSamples: number;
  tokensOutMeasuredSamples: number;
  tokensOutEstimatedSamples: number;
}

export interface CharAccum extends TokenSampleAccum {
  userTurns: number;
  assistantTurns: number;
  systemTurns: number;
  swipes: number;
  userWords: number;
  assistantWords: number;
  swipeWords: number;
  tokensIn: number;
  tokensOut: number;
  genTimeMs: number;
  genSamples: number;
  reasoningGenerations: number;
  reasoningMs: number;
  costUsd: number;
  costSamples: number;
  notionalCostSamples: number;
  activeIdxSum: number;
  variantMessages: number;
  contentChars: number;
  lastMsgAt: number;
}
export interface ModelAccum extends TokenSampleAccum {
  generations: number;
  tokensIn: number;
  tokensOut: number;
  genTimeMs: number;
  genSamples: number;
  reasoningGenerations: number;
  reasoningMs: number;
  costUsd: number;
  costSamples: number;
  notionalCostSamples: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}
export interface BucketAccum extends TokenSampleAccum {
  userTurns: number;
  assistantTurns: number;
  systemTurns: number;
  swipes: number;
  userWords: number;
  assistantWords: number;
  tokensIn: number;
  tokensOut: number;
  genTimeMs: number;
  costUsd: number;
  costSamples: number;
  notionalCostSamples: number;
  approx: boolean;
}
export interface OwnerAccum extends TokenSampleAccum {
  userTurns: number;
  assistantTurns: number;
  systemTurns: number;
  swipes: number;
  userWords: number;
  assistantWords: number;
  swipeWords: number;
  tokensIn: number;
  tokensOut: number;
  genTimeMs: number;
  genSamples: number;
  reasoningGenerations: number;
  reasoningMs: number;
  costUsd: number;
  costSamples: number;
  notionalCostSamples: number;
  activeIdxSum: number;
  variantMessages: number;
  contentChars: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  maxContextTokens: number | null;
  firstChatAt: number | null;
  lastActivityAt: number;
}
export interface ModelEntry {
  model: ModelId;
  provider: ProviderId | null;
  acc: ModelAccum;
}
/** The per-owner accumulator bundle threaded through the fold/scan helpers (one param, not four). */
export interface Accums {
  owner: OwnerAccum;
  charMap: Map<string, CharAccum>;
  bucketMap: Map<number, BucketAccum>;
  modelMap: Map<string, ModelEntry>;
}

export interface GenRow {
  ti: number | null;
  tout: number | null;
  tokenProvenance: TokenProvenance;
  gs: number | null;
  gf: number | null;
  reasoning: string | null;
  reasoningDur: number | null;
}

export interface ReconcileOpts {
  /** Scope to one owner; omit to rebuild every owner that owns a character. */
  ownerId?: string;
  /** INJECTED clock (epoch-ms) — the determinism seam (no-raw-clock). Stamped as every row's computedAt. */
  now: () => number;
  /** Cooperative abort between owners. */
  signal?: AbortSignal;
}

export interface MessageRow {
  mid: string;
  cid: string | null;
  role: string;
  createdAt: number;
  chatCreatedAt: number;
  content: string | null;
  ti: number | null;
  tout: number | null;
  tokenProvenance: TokenProvenance;
  gs: number | null;
  gf: number | null;
  model: string | null;
  provider: string | null;
  reasoning: string | null;
  reasoningDur: number | null;
  cost: number | null;
  cacheR: number | null;
  cacheW: number | null;
  ctx: number | null;
  selectedIdx: number | null;
  variantCount: number;
  usageLegs: string | null;
  metadata: string | null;
}

export interface SwipeRow {
  svid: string;
  cid: string | null;
  msgCreatedAt: number;
  content: string | null;
  ti: number | null;
  tout: number | null;
  tokenProvenance: TokenProvenance;
  gs: number | null;
  gf: number | null;
  model: string | null;
  provider: string | null;
  reasoning: string | null;
  reasoningDur: number | null;
  usageLegs: string | null;
}

/** Spend lands on owner and timeline, plus model when its identity is recorded. */
export interface SpendGrains {
  owner: OwnerAccum;
  bucket: BucketAccum;
  model: ModelAccum | null;
}

export interface CharChatMeta {
  chats: number;
  forkedChats: number;
  firstChatAt: number | null;
  maxChatUpdated: number | null;
}
export interface ChatMeta {
  chatByChar: Map<string, CharChatMeta>;
  chatsCreatedByBucket: Map<number, number>;
  library: { characters: number; chats: number; forkedChats: number };
}

export interface OwnerRollupRows {
  ownerRow: typeof ownerStats.$inferInsert;
  charRows: (typeof characterStats.$inferInsert)[];
  bucketRows: (typeof dailyStats.$inferInsert)[];
  modelRows: (typeof modelStats.$inferInsert)[];
}
