// @subject packages/client/src/features/credentials/lib/connection-fact-model.ts
// A number fact in the connection editor refuses what the contract's own declared schema refuses, so a value the
// server would answer with a failure never reaches Save. Each case reads the row the editor draws, builds the patch the
// editor would send for a typed value, and compares the row's refusal with the schema's verdict.

import type { Capability, DeclaredCapability, EndpointFeatures } from "@orb/contracts/inference";
import {
  declaredCapabilitySchema,
  EMBEDDING_FLOOR,
  providerIdSchema,
  RERANK_FLOOR,
  RERANK_MIN_WINDOW_TOKENS,
  SUMMARIZE_CONCURRENCY_MAX,
  VLLM_PROVIDER_ID,
} from "@orb/contracts/inference";
import { expect, test } from "@orb/testkit/node";
import { capabilityFactRows } from "#client/features/credentials/lib/connection-capability-fact-model.ts";
import type { FactRow } from "#client/features/credentials/lib/connection-fact-model.ts";
import { boundRefusal, parseFactValue, quirkFactRows, withDeclaredOverride } from "#client/features/credentials/lib/connection-fact-model.ts";

const EMBEDDING: Capability = { kind: "embedding", embedding: EMBEDDING_FLOOR };
const RERANK: Capability = { kind: "rerank", rerank: RERANK_FLOOR };

// A provider row that states every quirk number, so each of their rows is drawn.
const STATED_QUIRKS: EndpointFeatures = {
  pricing: { inputPerMTok: 1, outputPerMTok: 2, cacheReadPerMTok: 0.5, cacheWritePerMTok: 1.25 },
  embedBatch: { maxTokens: 1000, floorTokensPerSec: 5 },
  requestTimeoutMs: 30_000,
  numBatch: 512,
};

function rowAt(rows: readonly FactRow[], path: string): FactRow {
  const row = rows.find((candidate) => candidate.path === path);
  if (row === undefined) {
    throw new Error(`the editor draws no row at ${path}`);
  }
  return row;
}

const capabilityRows = (capability: Capability): readonly FactRow[] => capabilityFactRows(capability, null, capability);
const quirkRows = (): readonly FactRow[] =>
  quirkFactRows({ layers: [STATED_QUIRKS], label: "Provider", servedAs: providerIdSchema.parse(VLLM_PROVIDER_ID), ownServer: true }, undefined);

// The batch pair parses only whole, so the pair's other half rides under the typed one, as it does where a row already declares both.
const WHOLE_BATCH: DeclaredCapability = { features: { embedBatch: STATED_QUIRKS.embedBatch } };

/** What the server's own declared schema says about the patch the editor would send for this typed value. */
function schemaAccepts(row: FactRow, raw: string): boolean {
  const patch = withDeclaredOverride(WHOLE_BATCH, row, parseFactValue(row.edit, raw));
  return declaredCapabilitySchema.safeParse(patch satisfies DeclaredCapability).success;
}

// Whole, fractional, zero, negative and fine values: every number leaf takes a verdict from each.
const PROBES = ["-5", "-0.5", "0", "0.5", "1", "1.5", "32", "33", "768"] as const;

const FACTS = [
  { name: "vector width", row: (): FactRow => rowAt(capabilityRows(EMBEDDING), "embedding.dims") },
  { name: "embedding max input", row: (): FactRow => rowAt(capabilityRows(EMBEDDING), "embedding.maxInputTokens") },
  { name: "price in", row: (): FactRow => rowAt(quirkRows(), "features.pricing.inputPerMTok") },
  { name: "price out", row: (): FactRow => rowAt(quirkRows(), "features.pricing.outputPerMTok") },
  { name: "cache read price", row: (): FactRow => rowAt(quirkRows(), "features.pricing.cacheReadPerMTok") },
  { name: "cache write price", row: (): FactRow => rowAt(quirkRows(), "features.pricing.cacheWritePerMTok") },
  { name: "embeddings at once", row: (): FactRow => rowAt(quirkRows(), "features.concurrency.embed") },
  { name: "utility calls at once", row: (): FactRow => rowAt(quirkRows(), "features.concurrency.summarize") },
  { name: "embedding batch ceiling", row: (): FactRow => rowAt(quirkRows(), "features.embedBatch.maxTokens") },
  { name: "embedding slow-server floor", row: (): FactRow => rowAt(quirkRows(), "features.embedBatch.floorTokensPerSec") },
  { name: "request deadline", row: (): FactRow => rowAt(quirkRows(), "features.requestTimeoutMs") },
  { name: "prompt batch size", row: (): FactRow => rowAt(quirkRows(), "features.numBatch") },
] as const;

test.for(FACTS)("$name refuses exactly the typed values the declared schema refuses", ({ row }) => {
  const fact = row();
  const verdicts = PROBES.map((raw) => ({ raw, refused: boundRefusal(fact.edit, raw) !== null, accepted: schemaAccepts(fact, raw) }));
  // Never both: a value the editor lets through that the server refuses is a failed save, and the reverse blocks a real value.
  for (const { raw, refused, accepted } of verdicts) {
    expect({ raw, refused }).toEqual({ raw, refused: !accepted });
  }
  // The positive control: the probes include values the schema takes and values it refuses, so agreement is not vacuous.
  expect(verdicts.some((verdict) => verdict.accepted)).toBe(true);
  expect(verdicts.some((verdict) => !verdict.accepted)).toBe(true);
});

test("a utility-call count over the contract's ceiling is refused with the ceiling named, and the ceiling itself is taken", () => {
  const fact = rowAt(quirkRows(), "features.concurrency.summarize");
  expect(boundRefusal(fact.edit, String(SUMMARIZE_CONCURRENCY_MAX))).toBeNull();
  expect(boundRefusal(fact.edit, String(SUMMARIZE_CONCURRENCY_MAX + 1))).toContain(String(SUMMARIZE_CONCURRENCY_MAX));
});

test("a reranker window under the resolver's floor is refused with the floor named, and a fraction is no window", () => {
  const fact = rowAt(capabilityRows(RERANK), "rerank.maxInputTokens");
  expect(boundRefusal(fact.edit, String(RERANK_MIN_WINDOW_TOKENS))).toBeNull();
  expect(boundRefusal(fact.edit, String(RERANK_MIN_WINDOW_TOKENS - 1))).toContain(String(RERANK_MIN_WINDOW_TOKENS));
  expect(boundRefusal(fact.edit, "512.5")).not.toBeNull();
});

test("text that is no number is refused on every number fact", () => {
  for (const { row } of FACTS) {
    expect(boundRefusal(row().edit, "abc")).not.toBeNull();
  }
});
