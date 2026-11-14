// The additive columns of each rollup grain, and what a canon retirement does with each. This is the one roster of those
// columns: the retirement subtracts them, and a timeline or model row whose columns all read zero is deleted, because a
// rebuild from canon writes a row only for a grain something still lands on.

import type { SQL } from "drizzle-orm";
import { eq } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import type { BucketAccum, CharAccum, ModelAccum, OwnerAccum } from "../contract/rebuild-from-canon.ts";

type Additive<T> = { [K in keyof T]-?: T[K] extends number ? K : never }[keyof T];
// Spend the retirement keeps on the live rollups, because the ledger rows carry it; every other additive column leaves.
export type Disposition = "retire" | "keep";

// Last activity is an extremum: the settle after the delete re-derives it, so it has no disposition here.
export const OWNER_GRAIN: Readonly<Record<Exclude<Additive<OwnerAccum>, "lastActivityAt">, Disposition>> = {
  userTurns: "retire",
  assistantTurns: "retire",
  systemTurns: "retire",
  swipes: "retire",
  userWords: "retire",
  assistantWords: "retire",
  swipeWords: "retire",
  tokensIn: "retire",
  tokensOut: "retire",
  tokensInMeasuredSamples: "retire",
  tokensInEstimatedSamples: "retire",
  tokensOutMeasuredSamples: "retire",
  tokensOutEstimatedSamples: "retire",
  genTimeMs: "retire",
  genSamples: "retire",
  reasoningGenerations: "retire",
  reasoningMs: "retire",
  costUsd: "keep",
  costSamples: "keep",
  notionalCostSamples: "keep",
  activeIdxSum: "retire",
  variantMessages: "retire",
  contentChars: "retire",
  cacheReadTokens: "retire",
  cacheWriteTokens: "retire",
};

export const BUCKET_GRAIN: Readonly<Record<Additive<BucketAccum>, Disposition>> = {
  userTurns: "retire",
  assistantTurns: "retire",
  systemTurns: "retire",
  swipes: "retire",
  userWords: "retire",
  assistantWords: "retire",
  tokensIn: "retire",
  tokensOut: "retire",
  tokensInMeasuredSamples: "retire",
  tokensInEstimatedSamples: "retire",
  tokensOutMeasuredSamples: "retire",
  tokensOutEstimatedSamples: "retire",
  genTimeMs: "retire",
  costUsd: "keep",
  costSamples: "keep",
  notionalCostSamples: "keep",
};

export const MODEL_GRAIN: Readonly<Record<Additive<ModelAccum>, Disposition>> = {
  generations: "retire",
  tokensIn: "retire",
  tokensOut: "retire",
  tokensInMeasuredSamples: "retire",
  tokensInEstimatedSamples: "retire",
  tokensOutMeasuredSamples: "retire",
  tokensOutEstimatedSamples: "retire",
  genTimeMs: "retire",
  genSamples: "retire",
  reasoningGenerations: "retire",
  reasoningMs: "retire",
  costUsd: "keep",
  costSamples: "keep",
  notionalCostSamples: "keep",
  cacheReadTokens: "retire",
  cacheWriteTokens: "retire",
};

// The character's last message is its last activity, re-derived by the settle like the owner's.
export const CHARACTER_GRAIN: Readonly<Record<Exclude<Additive<CharAccum>, "lastMsgAt">, Disposition>> = {
  userTurns: "retire",
  assistantTurns: "retire",
  systemTurns: "retire",
  swipes: "retire",
  userWords: "retire",
  assistantWords: "retire",
  swipeWords: "retire",
  tokensIn: "retire",
  tokensOut: "retire",
  tokensInMeasuredSamples: "retire",
  tokensInEstimatedSamples: "retire",
  tokensOutMeasuredSamples: "retire",
  tokensOutEstimatedSamples: "retire",
  genTimeMs: "retire",
  genSamples: "retire",
  reasoningGenerations: "retire",
  reasoningMs: "retire",
  costUsd: "retire",
  costSamples: "retire",
  notionalCostSamples: "retire",
  activeIdxSum: "retire",
  variantMessages: "retire",
  contentChars: "retire",
};

/** `column = 0` for each of a grain's columns: a row where every one holds is a row the rebuild would not write. */
export function emptied<K extends string>(columns: { readonly [P in K]: SQLiteColumn }, keys: readonly K[]): SQL[] {
  return keys.map((key) => eq(columns[key], 0));
}

export const BUCKET_COLUMNS = [...(Object.keys(BUCKET_GRAIN) as (keyof typeof BUCKET_GRAIN)[]), "chatsCreated"] as const;
export const MODEL_COLUMNS = Object.keys(MODEL_GRAIN) as (keyof typeof MODEL_GRAIN)[];
