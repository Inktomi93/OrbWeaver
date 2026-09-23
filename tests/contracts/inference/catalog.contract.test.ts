// contracts/inference/catalog — the catalog ENTRY shapes. The whole point of these rows is that a model's
// pricing and window are NULLABLE and that `null` means UNPRICED / UNKNOWN, never zero: a schema that
// coerced them would turn "we do not know what this costs" into "this is free" on the cost surface. The
// other half is that a kindless `/v1/models` row is legal (only OpenRouter's catalog carries a kind), and
// that an unknown catalog key does not blow the parse up — a provider adding a field must not empty the
// picker.

import { agentSdkModelSchema, EFFORT_LEVELS, modelCatalogEntrySchema, modelListingSchema } from "@orb/contracts/inference";
import { expect, test } from "../../support/fixtures.ts";

const MINIMAL = {
  id: "openai/gpt-4o",
  name: "GPT-4o",
  contextLength: 128_000,
  promptPrice: 0.000_002_5,
  completionPrice: 0.000_01,
  cacheReadPrice: null,
  cacheWritePrice: null,
  inputModalities: ["text", "image"],
  supportedParameters: ["temperature"],
};

test("a full row round-trips, and null prices stay NULL (unpriced ≠ free)", () => {
  const parsed = modelCatalogEntrySchema.parse(MINIMAL);
  expect(parsed).toMatchObject({ id: MINIMAL.id, contextLength: 128_000, cacheReadPrice: null, cacheWritePrice: null });
  expect(parsed.cacheReadPrice, "a coerced 0 here would render a paid model as free").not.toBe(0);
});

test("an unknown window is `null` — the entry is still a valid row", () => {
  expect(modelCatalogEntrySchema.parse({ ...MINIMAL, contextLength: null }).contextLength).toBeNull();
});

test("`kind` is OPTIONAL — a plain `/v1/models` row carries none and must still parse", () => {
  const kindless = modelCatalogEntrySchema.parse(MINIMAL);
  expect(kindless.kind).toBeUndefined();
  expect(modelCatalogEntrySchema.parse({ ...MINIMAL, kind: "embedding" }).kind).toBe("embedding");
  expect(modelCatalogEntrySchema.safeParse({ ...MINIMAL, kind: "hologram" }).success, "the kind is the closed axis").toBe(false);
});

test("a row missing its id or name is refused — the picker cannot render an anonymous entry", () => {
  const { id: _id, ...noId } = MINIMAL;
  expect(modelCatalogEntrySchema.safeParse(noId).success).toBe(false);
  const { inputModalities: _modalities, ...noModalities } = MINIMAL;
  expect(modelCatalogEntrySchema.safeParse(noModalities).success).toBe(false);
});

test("the reasoning block is nullable AND optional — three distinct catalog answers, all legal", () => {
  expect(modelCatalogEntrySchema.parse({ ...MINIMAL, reasoning: null }).reasoning).toBeNull();
  expect(modelCatalogEntrySchema.parse({ ...MINIMAL, reasoning: { mandatory: true } }).reasoning).toMatchObject({ mandatory: true });
  expect(modelCatalogEntrySchema.parse(MINIMAL).reasoning).toBeUndefined();
});

test("an agent-sdk row's effort levels are the closed EFFORT_LEVELS vocabulary", () => {
  const row = {
    alias: "sonnet",
    resolvedModel: "claude-sonnet-4-20250514",
    displayName: "Sonnet",
    description: "",
    supportsEffort: true,
    effortLevels: [...EFFORT_LEVELS],
    supportsAdaptiveThinking: true,
  };
  expect(agentSdkModelSchema.parse(row).effortLevels).toEqual([...EFFORT_LEVELS]);
  expect(agentSdkModelSchema.safeParse({ ...row, effortLevels: ["none"] }).success, "`none` is the on/off axis, not an effort level").toBe(false);
  expect(agentSdkModelSchema.parse({ ...row, resolvedModel: null }).resolvedModel, "the daemon may omit the canonical id").toBeNull();
});

// A model-list answer is one of two exact shapes. A lenient branch would strip a stray key and pass a wrong
// answer through as a right one: `listed: false` with a `models: []` beside it reads to a careless caller as
// "listed no models" when the list failed.
test("a listed answer carries its models and nothing else", () => {
  expect(modelListingSchema.parse({ listed: true, models: [MINIMAL] })).toMatchObject({ listed: true, models: [{ id: MINIMAL.id }] });
  expect(modelListingSchema.safeParse({ listed: true, models: [MINIMAL], reason: null }).success, "an extra key is refused, not stripped").toBe(false);
});

test("an unlisted answer carries its reason and no model list", () => {
  expect(modelListingSchema.parse({ listed: false, reason: "HTTP 401" })).toEqual({ listed: false, reason: "HTTP 401" });
  expect(modelListingSchema.safeParse({ listed: false, models: [], reason: "HTTP 401" }).success, "a stray models list is refused, not stripped").toBe(false);
});
