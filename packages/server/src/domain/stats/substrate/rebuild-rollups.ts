// The canonical in-memory fold of retained stats canon. Persistence supplies scoped query rows;
// accumulator arithmetic, census population and rollup row construction have no database effects.

import { legacyNotionalCostSamples, parseVariantMetadata } from "@orb/contracts/chat";
import type { GenerationUsageLeg } from "@orb/contracts/inference";
import { generationUsageLegSchema, modelIdSchema, providerIdSchema } from "@orb/contracts/inference";
import type { SpendDeltaField, StatsDelta } from "@orb/contracts/stats";
import { SPEND_DELTA_FIELDS, variantUsageLegDelta } from "@orb/contracts/stats";
import type { characterStats, dailyStats, modelStats, ownerStats } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { MODEL_PROVIDER_UNKNOWN, statsBucketStart, wordCount } from "@orb/kit/stats-tally";
import type {
  Accums,
  BucketAccum,
  CanonMessage,
  CharAccum,
  CharChatMeta,
  ChatMeta,
  GenRow,
  ModelAccum,
  ModelEntry,
  OwnerAccum,
  OwnerRollupRows,
  OwnerRollupScope,
  SpendGrains,
  SwipeRow,
  TokenSampleAccum,
} from "../contract/rebuild-from-canon.ts";

const DAY_MS = 86_400_000;
const MIGRATION_GAP_DAYS = 30; // a message >30d after its chat's creation = migrated (createdAt clobbered)
const MIGRATION_GAP_MS = MIGRATION_GAP_DAYS * DAY_MS;

const freshChar = (): CharAccum => ({
  userTurns: 0,
  assistantTurns: 0,
  systemTurns: 0,
  swipes: 0,
  userWords: 0,
  assistantWords: 0,
  swipeWords: 0,
  tokensIn: 0,
  tokensOut: 0,
  tokensInMeasuredSamples: 0,
  tokensInEstimatedSamples: 0,
  tokensOutMeasuredSamples: 0,
  tokensOutEstimatedSamples: 0,
  genTimeMs: 0,
  genSamples: 0,
  reasoningGenerations: 0,
  reasoningMs: 0,
  costUsd: 0,
  costSamples: 0,
  notionalCostSamples: 0,
  activeIdxSum: 0,
  variantMessages: 0,
  contentChars: 0,
  lastMsgAt: 0,
});
const freshModel = (): ModelAccum => ({
  generations: 0,
  tokensIn: 0,
  tokensOut: 0,
  tokensInMeasuredSamples: 0,
  tokensInEstimatedSamples: 0,
  tokensOutMeasuredSamples: 0,
  tokensOutEstimatedSamples: 0,
  genTimeMs: 0,
  genSamples: 0,
  reasoningGenerations: 0,
  reasoningMs: 0,
  costUsd: 0,
  costSamples: 0,
  notionalCostSamples: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
});
const freshBucket = (): BucketAccum => ({
  userTurns: 0,
  assistantTurns: 0,
  systemTurns: 0,
  swipes: 0,
  userWords: 0,
  assistantWords: 0,
  tokensIn: 0,
  tokensOut: 0,
  tokensInMeasuredSamples: 0,
  tokensInEstimatedSamples: 0,
  tokensOutMeasuredSamples: 0,
  tokensOutEstimatedSamples: 0,
  genTimeMs: 0,
  costUsd: 0,
  costSamples: 0,
  notionalCostSamples: 0,
  approx: false,
});
const freshOwner = (): OwnerAccum => ({
  userTurns: 0,
  assistantTurns: 0,
  systemTurns: 0,
  swipes: 0,
  userWords: 0,
  assistantWords: 0,
  swipeWords: 0,
  tokensIn: 0,
  tokensOut: 0,
  tokensInMeasuredSamples: 0,
  tokensInEstimatedSamples: 0,
  tokensOutMeasuredSamples: 0,
  tokensOutEstimatedSamples: 0,
  genTimeMs: 0,
  genSamples: 0,
  reasoningGenerations: 0,
  reasoningMs: 0,
  costUsd: 0,
  costSamples: 0,
  notionalCostSamples: 0,
  activeIdxSum: 0,
  variantMessages: 0,
  contentChars: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  maxContextTokens: null,
  firstChatAt: null,
  lastActivityAt: 0,
});

function get<K, V>(map: Map<K, V>, key: K, mk: () => V): V {
  let v = map.get(key);
  if (v === undefined) {
    v = mk();
    map.set(key, v);
  }
  return v;
}

function foldTokenSamples(acc: TokenSampleAccum, r: Pick<GenRow, "ti" | "tout" | "tokenProvenance">): void {
  if (r.tokenProvenance === "unrecorded") {
    return;
  }
  const kind = r.tokenProvenance === "measured" ? "MeasuredSamples" : "EstimatedSamples";
  if (r.ti !== null) {
    acc[`tokensIn${kind}`]++;
  }
  if (r.tout !== null) {
    acc[`tokensOut${kind}`]++;
  }
}

/** metadata.reasoning_duration as non-negative rounded ms, or 0 when absent/invalid.
 *  THE PATH LITERAL: `'$.reasoning_duration'` in the persistence scans is the ONE key
 *  `VARIANT_METADATA_REASONING_MS_KEY` (`@orb/contracts/chat`) names — spelled inline because an
 *  interpolated value inside a `sql` template binds as a PARAMETER, not as a JSON path. Its live producer is
 *  the turn engine (#184); the ST import writes the same key on the import path. */
function reasoningMsOf(r: GenRow): number {
  const d = Number(r.reasoningDur);
  return Number.isFinite(d) && d > 0 ? Math.round(d) : 0;
}
/** A non-empty reasoning/thinking snapshot was recorded on this row. */
function hasReasoning(r: GenRow): boolean {
  return r.reasoning !== null && r.reasoning.trim().length > 0;
}
/** The completed gen window (gf−gs) when both bounds are present and ordered, else null. */
function genDurationMs(r: GenRow): number | null {
  return r.gs !== null && r.gf !== null && r.gf >= r.gs ? r.gf - r.gs : null;
}

/** Fold one generation row into a model accumulator's COMMON columns (cost/cache folded by the caller). */
function foldModelGen(m: ModelAccum, r: GenRow): void {
  m.generations++;
  m.tokensIn += r.ti ?? 0;
  m.tokensOut += r.tout ?? 0;
  foldTokenSamples(m, r);
  m.reasoningMs += reasoningMsOf(r);
  const d = genDurationMs(r);
  if (d !== null) {
    m.genTimeMs += d;
    m.genSamples++;
  }
  if (hasReasoning(r)) {
    m.reasoningGenerations++;
  }
}

function modelMapKey(model: string, provider: string | null): string {
  return `${model} ${provider ?? MODEL_PROVIDER_UNKNOWN}`;
}

function modelIdentity(model: string | null, provider: string | null): Omit<ModelEntry, "acc"> | null {
  if (model === null) {
    return null;
  }
  const parsedModel = modelIdSchema.safeParse(model);
  if (!parsedModel.success) {
    return null;
  }
  return {
    model: parsedModel.data,
    provider: provider === null ? null : (providerIdSchema.safeParse(provider).data ?? null),
  };
}

/** SQLite returns serialized JSON only for the array arm selected by both scans. */
function usageLegsOf(raw: string | null): readonly GenerationUsageLeg[] {
  return raw === null ? [] : (generationUsageLegSchema.array().safeParse(JSON.parse(raw)).data ?? []);
}

/** The ordered retained usage legs credit the same grains as their live accounting deltas. */
function foldVariantLegs(
  args: { readonly ownerId: string; readonly cid: string | null; readonly legs: readonly GenerationUsageLeg[]; readonly selected: boolean },
  a: Accums,
): void {
  const { ownerId, cid, legs, selected } = args;
  for (const leg of legs) {
    const delta = variantUsageLegDelta({
      ownerId: castId<UserId>(ownerId),
      characterId: cid === null ? null : castId<CharacterId>(cid),
      leg,
      selected,
      sign: 1,
      now: leg.observedAt,
    });
    foldSpend(delta, a);
    if (cid !== null) {
      const character = get(a.charMap, cid, freshChar);
      character.tokensIn += delta.tokensIn ?? 0;
      character.tokensOut += delta.tokensOut ?? 0;
      character.tokensInMeasuredSamples += delta.tokensInMeasuredSamples ?? 0;
      character.tokensOutMeasuredSamples += delta.tokensOutMeasuredSamples ?? 0;
      character.costUsd += delta.costUsd ?? 0;
      character.costSamples += delta.costSamples ?? 0;
      character.notionalCostSamples += delta.notionalCostSamples ?? 0;
      character.lastMsgAt = Math.max(character.lastMsgAt, delta.lastAt ?? 0);
    }
  }
}

/** Owner-grain economics from a message's SELECTED variant (tokens/cost/cache/ctx/chars/gen/reasoning). */
function foldOwnerMessage(owner: OwnerAccum, bucket: BucketAccum, r: CanonMessage): void {
  const chars = r.content?.length ?? 0;
  owner.contentChars += chars;
  owner.tokensIn += r.ti ?? 0;
  owner.tokensOut += r.tout ?? 0;
  foldTokenSamples(owner, r);
  owner.costUsd += r.cost ?? 0;
  owner.costSamples += Number(r.cost !== null);
  owner.cacheReadTokens += r.cacheR ?? 0;
  owner.cacheWriteTokens += r.cacheW ?? 0;
  owner.reasoningMs += reasoningMsOf(r);
  if (r.ctx !== null && (owner.maxContextTokens === null || r.ctx > owner.maxContextTokens)) {
    owner.maxContextTokens = r.ctx;
  }
  if (r.createdAt > owner.lastActivityAt) {
    owner.lastActivityAt = r.createdAt;
  }
  bucket.tokensIn += r.ti ?? 0;
  bucket.tokensOut += r.tout ?? 0;
  foldTokenSamples(bucket, r);
  bucket.costUsd += r.cost ?? 0;
  bucket.costSamples += Number(r.cost !== null);
  const gen = genDurationMs(r);
  if (gen !== null) {
    owner.genTimeMs += gen;
    owner.genSamples++;
    bucket.genTimeMs += gen;
  }
}

/** Turn/word counts split on role (ST is_user binary: userWords vs non-user assistant+system words). */
function foldRoleCounts(owner: OwnerAccum, bucket: BucketAccum, r: CanonMessage): void {
  const words = wordCount(r.content);
  if (r.role === "user") {
    owner.userTurns++;
    owner.userWords += words;
    bucket.userTurns++;
    bucket.userWords += words;
    return;
  }
  owner.assistantWords += words;
  bucket.assistantWords += words;
  if (r.role === "system") {
    owner.systemTurns++;
    bucket.systemTurns++;
  } else {
    owner.assistantTurns++;
    bucket.assistantTurns++;
  }
}

/** Per-character grain (assistant only; system/user carry no characterId). */
function foldMessageChar(charMap: Map<string, CharAccum>, r: CanonMessage): void {
  const c = get(charMap, r.cid as string, freshChar);
  c.assistantTurns++;
  c.assistantWords += wordCount(r.content);
  c.contentChars += r.content?.length ?? 0;
  c.tokensIn += r.ti ?? 0;
  c.tokensOut += r.tout ?? 0;
  foldTokenSamples(c, r);
  c.costUsd += r.cost ?? 0;
  c.costSamples += r.cost === null ? 0 : 1;
  c.reasoningMs += reasoningMsOf(r);
  const gen = genDurationMs(r);
  if (gen !== null) {
    c.genTimeMs += gen;
    c.genSamples++;
  }
  if (hasReasoning(r)) {
    c.reasoningGenerations++;
  }
  if (r.variantCount > 1 && r.selectedIdx !== null) {
    c.variantMessages++;
    c.activeIdxSum += r.selectedIdx;
  }
  if (r.createdAt > c.lastMsgAt) {
    c.lastMsgAt = r.createdAt;
  }
}

/** Fold one message (its SELECTED variant — the kept take) across owner/char/bucket/model accumulators. */
function foldMessage(r: CanonMessage, a: Accums): void {
  const notionalSamples = legacyNotionalCostSamples(r.cost, parseVariantMetadata(r.metadata === null ? null : JSON.parse(r.metadata)));
  const bucket = get(a.bucketMap, statsBucketStart(r.createdAt), freshBucket);
  if (r.createdAt - r.chatCreatedAt > MIGRATION_GAP_MS) {
    bucket.approx = true;
  }
  foldOwnerMessage(a.owner, bucket, r);
  a.owner.notionalCostSamples += notionalSamples;
  bucket.notionalCostSamples += notionalSamples;
  foldRoleCounts(a.owner, bucket, r);
  // Settle depth: a re-rolled message (>1 variant) contributes its SELECTED idx (the take you kept).
  if (r.variantCount > 1 && r.selectedIdx !== null) {
    a.owner.variantMessages++;
    a.owner.activeIdxSum += r.selectedIdx;
  }
  if (r.role === "assistant" && hasReasoning(r)) {
    a.owner.reasoningGenerations++;
  }
  if (r.role === "assistant" && r.cid !== null) {
    foldMessageChar(a.charMap, r);
    get(a.charMap, r.cid, freshChar).notionalCostSamples += notionalSamples;
  }
  const identity = r.role === "assistant" ? modelIdentity(r.model, r.provider) : null;
  if (identity !== null) {
    const entry = get(a.modelMap, modelMapKey(identity.model, identity.provider), () => ({
      ...identity,
      acc: freshModel(),
    }));
    foldModelGen(entry.acc, r);
    entry.acc.costUsd += r.cost ?? 0;
    entry.acc.costSamples += r.cost === null ? 0 : 1;
    entry.acc.notionalCostSamples += notionalSamples;
    entry.acc.cacheReadTokens += r.cacheR ?? 0;
    entry.acc.cacheWriteTokens += r.cacheW ?? 0;
  }
}

/** Per-character swipe fold (assistant re-rolls). */
function foldSwipeChar(charMap: Map<string, CharAccum>, r: SwipeRow): void {
  const c = get(charMap, r.cid as string, freshChar);
  c.swipes++;
  c.swipeWords += wordCount(r.content);
  c.contentChars += r.content?.length ?? 0;
  c.tokensIn += r.ti ?? 0;
  c.tokensOut += r.tout ?? 0;
  foldTokenSamples(c, r);
  c.reasoningMs += reasoningMsOf(r);
  const gen = genDurationMs(r);
  if (gen !== null) {
    c.genTimeMs += gen;
    c.genSamples++;
  }
  if (hasReasoning(r)) {
    c.reasoningGenerations++;
  }
}

/** Fold one swipe (a NON-selected variant) across owner/char/bucket/model. Swipes credit the RE-ROLL
 *  counters; the timeline bucket gets swipe COUNT + gen-time but NOT swipe tokens (esoteric #1). */
function foldSwipe(r: SwipeRow, a: Accums): void {
  const bucket = get(a.bucketMap, statsBucketStart(r.msgCreatedAt), freshBucket);
  const gen = genDurationMs(r);
  a.owner.swipes++;
  a.owner.swipeWords += wordCount(r.content);
  a.owner.contentChars += r.content?.length ?? 0;
  a.owner.tokensIn += r.ti ?? 0;
  a.owner.tokensOut += r.tout ?? 0;
  foldTokenSamples(a.owner, r);
  a.owner.reasoningMs += reasoningMsOf(r);
  bucket.swipes++;
  if (gen !== null) {
    a.owner.genTimeMs += gen;
    a.owner.genSamples++;
    bucket.genTimeMs += gen;
  }
  if (hasReasoning(r)) {
    a.owner.reasoningGenerations++;
  }
  if (r.cid !== null) {
    foldSwipeChar(a.charMap, r);
  }
  const identity = modelIdentity(r.model, r.provider);
  if (identity !== null) {
    const entry = get(a.modelMap, modelMapKey(identity.model, identity.provider), () => ({
      ...identity,
      acc: freshModel(),
    }));
    foldModelGen(entry.acc, r); // swipes carry no cost/cache into the model bucket
  }
}

function addToModel(model: ModelAccum | null, key: keyof ModelAccum, v: number): void {
  if (model !== null) {
    model[key] += v;
  }
}

/** Where each spend key lands — `applyStatsDelta`'s column mapping, one arm per {@link SPEND_DELTA_FIELDS}. */
const SPEND_FOLD: Readonly<Record<SpendDeltaField, (g: SpendGrains, v: number) => void>> = {
  costUsd: (g, v) => {
    g.owner.costUsd += v;
    g.bucket.costUsd += v;
  },
  costSamples: (g, v) => {
    g.owner.costSamples += v;
    g.bucket.costSamples += v;
  },
  modelGenerations: (g, v) => addToModel(g.model, "generations", v),
  modelGenSamples: (g, v) => addToModel(g.model, "genSamples", v),
  modelCostUsd: (g, v) => addToModel(g.model, "costUsd", v),
  modelCostSamples: (g, v) => addToModel(g.model, "costSamples", v),
  modelNotionalCostSamples: (g, v) => addToModel(g.model, "notionalCostSamples", v),
  notionalCostSamples: (g, v) => {
    g.owner.notionalCostSamples += v;
    g.bucket.notionalCostSamples += v;
  },
  tokensIn: (g, v) => {
    g.owner.tokensIn += v;
  },
  tokensInMeasuredSamples: (g, v) => {
    g.owner.tokensInMeasuredSamples += v;
  },
  dailyTokensIn: (g, v) => {
    g.bucket.tokensIn += v;
  },
  dailyTokensInMeasuredSamples: (g, v) => {
    g.bucket.tokensInMeasuredSamples += v;
  },
  modelTokensIn: (g, v) => addToModel(g.model, "tokensIn", v),
  modelTokensInMeasuredSamples: (g, v) => addToModel(g.model, "tokensInMeasuredSamples", v),
  tokensOut: (g, v) => {
    g.owner.tokensOut += v;
  },
  tokensOutMeasuredSamples: (g, v) => {
    g.owner.tokensOutMeasuredSamples += v;
  },
  dailyTokensOut: (g, v) => {
    g.bucket.tokensOut += v;
  },
  dailyTokensOutMeasuredSamples: (g, v) => {
    g.bucket.tokensOutMeasuredSamples += v;
  },
  modelTokensOut: (g, v) => addToModel(g.model, "tokensOut", v),
  modelTokensOutMeasuredSamples: (g, v) => addToModel(g.model, "tokensOutMeasuredSamples", v),
  cacheReadTokens: (g, v) => {
    g.owner.cacheReadTokens += v;
  },
  cacheWriteTokens: (g, v) => {
    g.owner.cacheWriteTokens += v;
  },
  modelCacheReadTokens: (g, v) => addToModel(g.model, "cacheReadTokens", v),
  modelCacheWriteTokens: (g, v) => addToModel(g.model, "cacheWriteTokens", v),
  lastAt: (g, v) => {
    g.owner.lastActivityAt = Math.max(g.owner.lastActivityAt, v);
  },
};

/** Fold one spend delta. The timeline bucket (and the model row) exists even for a zero-valued delta,
 *  because the live upsert writes those rows whatever the increments are. */
export function foldSpend(d: StatsDelta, a: Accums): void {
  const identity = modelIdentity(d.model, d.provider);
  const grains: SpendGrains = {
    owner: a.owner,
    bucket: get(a.bucketMap, d.bucketStart, freshBucket),
    model: identity === null ? null : get(a.modelMap, modelMapKey(identity.model, identity.provider), () => ({ ...identity, acc: freshModel() })).acc,
  };
  for (const field of SPEND_DELTA_FIELDS) {
    const v = d[field];
    if (typeof v === "number") {
      SPEND_FOLD[field](grains, v);
    }
  }
}

/** Owner extrema: earliest chat created, latest of (last message seen, last chat update). */
export function ownerExtrema(owner: OwnerAccum, meta: ChatMeta): void {
  let first: number | null = null;
  for (const m of meta.chatByChar.values()) {
    if (m.firstChatAt !== null && (first === null || m.firstChatAt < first)) {
      first = m.firstChatAt;
    }
    if (m.maxChatUpdated !== null && m.maxChatUpdated > owner.lastActivityAt) {
      owner.lastActivityAt = m.maxChatUpdated;
    }
  }
  owner.firstChatAt = first;
}

/** THE CENSUS POPULATION IS SEATS ∪ AUTHORSHIP (#1147): a character that HOLDS A SEAT in a started room
 *  gets a row even when it never spoke (a greet-less card, an imported cast member, a member added but not
 *  yet prompted) — "seated here, never spoke" is a real library state and its zero-economics row is the
 *  honest answer, not an absent character. The authorship half stays because a character can author canon in
 *  a room it has since LEFT with its seat row dropped by an old write. Sorted so the emitted row order (and
 *  therefore the minted-id order) is a pure function of the canon. */
function censusPopulation(charMap: Map<string, CharAccum>, meta: ChatMeta): string[] {
  return [...new Set([...charMap.keys(), ...meta.chatByChar.keys()])].sort();
}

/** Census rows include silent seats and retained authorship; activity ordering is canon-derived. */
function buildCharRows(charMap: Map<string, CharAccum>, meta: ChatMeta, now: number): (typeof characterStats.$inferInsert)[] {
  return censusPopulation(charMap, meta).map((characterId) => {
    const c = charMap.get(characterId) ?? freshChar();
    const m = meta.chatByChar.get(characterId);
    const lastActivityAt = Math.max(c.lastMsgAt, m?.maxChatUpdated ?? 0) || null;
    return {
      id: mintTypeId(ID_PREFIX.characterStat),
      characterId: castId<CharacterId>(characterId),
      chats: m?.chats ?? 0,
      userTurns: c.userTurns,
      assistantTurns: c.assistantTurns,
      systemTurns: c.systemTurns,
      swipes: c.swipes,
      userWords: c.userWords,
      assistantWords: c.assistantWords,
      swipeWords: c.swipeWords,
      tokensIn: c.tokensIn,
      tokensOut: c.tokensOut,
      tokensInMeasuredSamples: c.tokensInMeasuredSamples,
      tokensInEstimatedSamples: c.tokensInEstimatedSamples,
      tokensOutMeasuredSamples: c.tokensOutMeasuredSamples,
      tokensOutEstimatedSamples: c.tokensOutEstimatedSamples,
      costUsd: c.costUsd,
      costSamples: c.costSamples,
      notionalCostSamples: c.notionalCostSamples,
      genTimeMs: c.genTimeMs,
      genSamples: c.genSamples,
      reasoningGenerations: c.reasoningGenerations,
      reasoningMs: c.reasoningMs,
      activeIdxSum: c.activeIdxSum,
      variantMessages: c.variantMessages,
      forkedChats: m?.forkedChats ?? 0,
      contentChars: c.contentChars,
      firstChatAt: m?.firstChatAt ?? null,
      lastActivityAt,
      computedAt: now,
    };
  });
}

/** Library counts and folded economics share one computed owner row, including computed-empty. */
function buildOwnerRow(ownerId: UserId, owner: OwnerAccum, meta: ChatMeta, now: number): typeof ownerStats.$inferInsert {
  return {
    ownerId,
    characters: meta.library.characters,
    chats: meta.library.chats,
    userTurns: owner.userTurns,
    assistantTurns: owner.assistantTurns,
    systemTurns: owner.systemTurns,
    swipes: owner.swipes,
    userWords: owner.userWords,
    assistantWords: owner.assistantWords,
    swipeWords: owner.swipeWords,
    tokensIn: owner.tokensIn,
    tokensOut: owner.tokensOut,
    tokensInMeasuredSamples: owner.tokensInMeasuredSamples,
    tokensInEstimatedSamples: owner.tokensInEstimatedSamples,
    tokensOutMeasuredSamples: owner.tokensOutMeasuredSamples,
    tokensOutEstimatedSamples: owner.tokensOutEstimatedSamples,
    costUsd: owner.costUsd,
    costSamples: owner.costSamples,
    notionalCostSamples: owner.notionalCostSamples,
    genTimeMs: owner.genTimeMs,
    genSamples: owner.genSamples,
    reasoningGenerations: owner.reasoningGenerations,
    reasoningMs: owner.reasoningMs,
    activeIdxSum: owner.activeIdxSum,
    variantMessages: owner.variantMessages,
    forkedChats: meta.library.forkedChats,
    contentChars: owner.contentChars,
    cacheReadTokens: owner.cacheReadTokens,
    cacheWriteTokens: owner.cacheWriteTokens,
    maxContextTokens: owner.maxContextTokens,
    firstChatAt: owner.firstChatAt,
    lastActivityAt: owner.lastActivityAt || null,
    computedAt: now,
  };
}

/** A chat creation without messages still produces a timeline bucket. */
export function buildBucketRows(ownerId: UserId, bucketMap: Map<number, BucketAccum>, meta: ChatMeta, now: number): (typeof dailyStats.$inferInsert)[] {
  const bucketKeys = new Set([...bucketMap.keys(), ...meta.chatsCreatedByBucket.keys()]);
  return [...bucketKeys].map((bucketStart) => {
    const d = bucketMap.get(bucketStart) ?? freshBucket();
    return {
      id: mintTypeId(ID_PREFIX.dailyStat),
      ownerId,
      bucketStart,
      chatsCreated: meta.chatsCreatedByBucket.get(bucketStart) ?? 0,
      userTurns: d.userTurns,
      assistantTurns: d.assistantTurns,
      systemTurns: d.systemTurns,
      swipes: d.swipes,
      userWords: d.userWords,
      assistantWords: d.assistantWords,
      tokensIn: d.tokensIn,
      tokensOut: d.tokensOut,
      tokensInMeasuredSamples: d.tokensInMeasuredSamples,
      tokensInEstimatedSamples: d.tokensInEstimatedSamples,
      tokensOutMeasuredSamples: d.tokensOutMeasuredSamples,
      tokensOutEstimatedSamples: d.tokensOutEstimatedSamples,
      costUsd: d.costUsd,
      costSamples: d.costSamples,
      notionalCostSamples: d.notionalCostSamples,
      genTimeMs: d.genTimeMs,
      messageDatesApprox: d.approx,
      computedAt: now,
    };
  });
}

/** Providers remain part of model identity, including the legacy unknown-provider sentinel. */
function buildModelRows(ownerId: UserId, modelMap: Map<string, ModelEntry>, now: number): (typeof modelStats.$inferInsert)[] {
  return [...modelMap.values()].map(({ model, provider, acc }) => ({
    id: mintTypeId(ID_PREFIX.modelStat),
    ownerId,
    model,
    provider: provider ?? MODEL_PROVIDER_UNKNOWN,
    generations: acc.generations,
    tokensIn: acc.tokensIn,
    tokensOut: acc.tokensOut,
    tokensInMeasuredSamples: acc.tokensInMeasuredSamples,
    tokensInEstimatedSamples: acc.tokensInEstimatedSamples,
    tokensOutMeasuredSamples: acc.tokensOutMeasuredSamples,
    tokensOutEstimatedSamples: acc.tokensOutEstimatedSamples,
    genTimeMs: acc.genTimeMs,
    genSamples: acc.genSamples,
    reasoningGenerations: acc.reasoningGenerations,
    reasoningMs: acc.reasoningMs,
    costUsd: acc.costUsd,
    costSamples: acc.costSamples,
    notionalCostSamples: acc.notionalCostSamples,
    cacheReadTokens: acc.cacheReadTokens,
    cacheWriteTokens: acc.cacheWriteTokens,
    computedAt: now,
  }));
}

/** Fresh state per owner; no accumulator survives a rebuild or crosses its owner boundary. */
export function createOwnerAccums(): Accums {
  return {
    owner: freshOwner(),
    charMap: new Map<string, CharAccum>(),
    bucketMap: new Map<number, BucketAccum>(),
    modelMap: new Map<string, ModelEntry>(),
  };
}

/** Fold the scoped query aggregates into the same lookup maps used by each rollup grain. */
export function buildChatMeta(
  chatAgg: readonly ({ cid: string } & CharChatMeta)[],
  chatBuckets: readonly { bucketStart: number; n: number }[],
  library: ChatMeta["library"],
): ChatMeta {
  const chatByChar = new Map(chatAgg.map((r) => [r.cid, r]));
  const chatsCreatedByBucket = new Map(chatBuckets.map((r) => [r.bucketStart, r.n]));
  return { chatByChar, chatsCreatedByBucket, library };
}

/** Character rollups inherit ownership from characters, not from the room's retained accounting cohort. */
export function buildOwnerRows({ ownerId, ownedCharacterIds }: OwnerRollupScope, a: Accums, meta: ChatMeta, now: number): OwnerRollupRows {
  const ownedCharacters = new Set(ownedCharacterIds);
  return {
    ownerRow: buildOwnerRow(ownerId, a.owner, meta, now),
    charRows: buildCharRows(a.charMap, meta, now).filter((row) => ownedCharacters.has(row.characterId)),
    bucketRows: buildBucketRows(ownerId, a.bucketMap, meta, now),
    modelRows: buildModelRows(ownerId, a.modelMap, now),
  };
}

/** Retained usage legs replace legacy totals while keeping the selected message's other counters. */
export function foldCanonMessage(ownerId: string, r: CanonMessage, a: Accums): void {
  const legs = usageLegsOf(r.usageLegs);
  foldMessage(legs.length === 0 ? r : { ...r, ti: null, tout: null, cost: null, cacheR: null, cacheW: null, tokenProvenance: "unrecorded" }, a);
  foldVariantLegs({ ownerId, cid: r.role === "assistant" ? r.cid : null, legs, selected: true }, a);
}

/** Unselected legs retain spend but do not credit the timeline's selected-message token counters. */
export function foldCanonSwipe(ownerId: string, r: SwipeRow, a: Accums): void {
  const legs = usageLegsOf(r.usageLegs);
  foldSwipe(legs.length === 0 ? r : { ...r, ti: null, tout: null, tokenProvenance: "unrecorded" }, a);
  foldVariantLegs({ ownerId, cid: r.cid, legs, selected: false }, a);
}
