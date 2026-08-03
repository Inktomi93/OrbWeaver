import type { ApplyStatsDelta, StatsDelta } from "@orb/contracts/stats";
import { statsDeltaSchema } from "@orb/contracts/stats";
import type { UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures.ts";

// Sample keys: a low-entropy owner brand at the untyped seam + a minted character TypeID (no pasted
// high-entropy literals — noSecrets). The day grain is what `@orb/kit/stats-tally.utcDay` emits.
const OWNER_ID = castId<UserId>("user-owner");
const CHARACTER_ID = mintTypeId(ID_PREFIX.character);
const DAY = "2026-06-26";
const NOW_MS = 1_750_000_000_000;

test("statsDeltaSchema parses the minimal grain-only delta and round-trips (no defaults injected)", () => {
  // The required floor: keys + grain + the `now` computedAt stamp; every increment omitted.
  const value = {
    ownerId: OWNER_ID,
    characterId: CHARACTER_ID,
    day: DAY,
    model: "claude-opus-4",
    provider: "anthropic",
    now: NOW_MS,
  };
  const parsed = statsDeltaSchema.parse(value);
  // No `.default()` anywhere → an omitted increment stays absent (the delta is a sparse patch); a
  // round-trip that silently grew `tokensIn: 0` keys would double-count under `col = col + excluded.col`.
  expect(parsed).toEqual(value);
  expect(Object.keys(parsed).sort()).toEqual(["characterId", "day", "model", "now", "ownerId", "provider"].sort());
});

test("a MESSAGE delta carries the scalar + daily + model slices together and round-trips", () => {
  const value: StatsDelta = {
    ownerId: OWNER_ID,
    characterId: CHARACTER_ID,
    day: DAY,
    model: "claude-opus-4",
    provider: "anthropic",
    now: NOW_MS,
    assistantTurns: 1,
    assistantWords: 42,
    tokensIn: 1200,
    tokensOut: 800,
    // daily slice — a message credits the daily timeseries
    dailyTokensIn: 1200,
    dailyTokensOut: 800,
    modelGenerations: 1,
    modelTokensIn: 1200,
    modelTokensOut: 800,
  };
  expect(statsDeltaSchema.parse(value)).toEqual(value);
});

// stats.md esoteric #1 — the 3-slice decoupling: a VARIANT (swipe) bumps scalar tokens but must NOT
// credit the daily token slice (daily credits the MESSAGE stream only), else a re-rolled turn
// double-counts daily tokens. The schema must ACCEPT a delta that sets scalar tokens while omitting
// `dailyTokensIn`/`dailyTokensOut`.
test("a VARIANT delta sets scalar tokens but OMITS the daily token slice (decoupling pin)", () => {
  const value: StatsDelta = {
    ownerId: OWNER_ID,
    characterId: CHARACTER_ID,
    day: DAY,
    model: "claude-opus-4",
    provider: "anthropic",
    now: NOW_MS,
    swipes: 1,
    swipeWords: 30,
    tokensIn: 500,
    tokensOut: 350,
    genTimeMs: 900,
    // model slice present; daily slice intentionally absent
    modelGenerations: 1,
    modelTokensIn: 500,
    modelTokensOut: 350,
  };
  const parsed = statsDeltaSchema.parse(value);
  expect(parsed).toEqual(value);
  expect("dailyTokensIn" in parsed).toBe(false);
  expect("dailyTokensOut" in parsed).toBe(false);
});

// A swipe to a DIFFERENT model emits a model-only delta: no scalar/daily token credit, just the model
// slice + the `now` stamp. Confirms the model slice is independently settable.
test("a MODEL-ONLY delta (cross-model swipe bucket) round-trips with no scalar token fields", () => {
  const value: StatsDelta = {
    ownerId: OWNER_ID,
    characterId: CHARACTER_ID,
    day: DAY,
    model: "claude-sonnet-4",
    provider: "anthropic",
    now: NOW_MS,
    modelGenerations: 1,
    modelTokensIn: 480,
    modelTokensOut: 300,
  };
  const parsed = statsDeltaSchema.parse(value);
  expect(parsed).toEqual(value);
  expect("tokensIn" in parsed).toBe(false);
  expect("dailyTokensIn" in parsed).toBe(false);
});

test("the keys are nullable where the grain allows it (system / no-model writes)", () => {
  const value: StatsDelta = {
    ownerId: OWNER_ID,
    characterId: null, // system / no-character write → character_stats skipped
    day: DAY,
    model: null, // no-model write → model_stats skipped
    provider: null,
    now: NOW_MS,
    systemTurns: 1,
  };
  expect(statsDeltaSchema.parse(value)).toEqual(value);
});

// Maintenance extrema: nullable AND optional; negative increments are legal (a delete emits new − old).
test("maintenance extrema (firstAt/lastAt/maxContextTokens) accept nulls; increments accept negatives", () => {
  const value: StatsDelta = {
    ownerId: OWNER_ID,
    characterId: CHARACTER_ID,
    day: DAY,
    model: null,
    provider: null,
    now: NOW_MS,
    newCharacter: true,
    firstAt: NOW_MS,
    lastAt: null,
    maxContextTokens: null,
    // a delete delta walks the totals back down — negative is intentional, not rejected.
    assistantTurns: -1,
    tokensOut: -800,
  };
  expect(statsDeltaSchema.parse(value)).toEqual(value);
});

test("statsDeltaSchema rejects a delta missing the required `now` stamp", () => {
  const invalid = {
    ownerId: OWNER_ID,
    characterId: CHARACTER_ID,
    day: DAY,
    model: null,
    provider: null,
  };
  expect(statsDeltaSchema.safeParse(invalid).success).toBe(false);
});

test("statsDeltaSchema rejects an empty ownerId and a wrong-prefix characterId", () => {
  const emptyOwner = {
    ownerId: "",
    characterId: CHARACTER_ID,
    day: DAY,
    model: null,
    provider: null,
    now: NOW_MS,
  };
  expect(statsDeltaSchema.safeParse(emptyOwner).success).toBe(false);
  // A persona id where a character id is required — the branded prefix check rejects it.
  const wrongPrefix = {
    ownerId: OWNER_ID,
    characterId: mintTypeId(ID_PREFIX.persona),
    day: DAY,
    model: null,
    provider: null,
    now: NOW_MS,
  };
  expect(statsDeltaSchema.safeParse(wrongPrefix).success).toBe(false);
});

test("statsDeltaSchema rejects a non-numeric increment", () => {
  const value = {
    ownerId: OWNER_ID,
    characterId: CHARACTER_ID,
    day: DAY,
    model: null,
    provider: null,
    now: NOW_MS,
    tokensIn: "1200",
  };
  expect(statsDeltaSchema.safeParse(value).success).toBe(false);
});

// ApplyStatsDelta is the injected-op signature (chat↔stats wire, db-free here via generic Batch/Db
// params). Pin it structurally: a no-op default (chat's stats-less default) satisfies the type, and the
// op receives the StatsDelta this node owns. The concrete Batch/Db are bound at the domain/chat sites.
test("ApplyStatsDelta is satisfiable by a no-op and consumes a StatsDelta", () => {
  type Batch = unknown[];
  type Db = Record<string, never>;
  const seen: StatsDelta[] = [];
  const applyStatsDelta: ApplyStatsDelta<Batch, Db> = (sink, _db, received) => {
    sink.push(received);
    seen.push(received);
  };
  const delta: StatsDelta = {
    ownerId: OWNER_ID,
    characterId: CHARACTER_ID,
    day: DAY,
    model: "claude-opus-4",
    provider: "anthropic",
    now: NOW_MS,
    assistantTurns: 1,
  };
  const batch: Batch = [];
  applyStatsDelta(batch, {}, delta);
  expect(batch).toHaveLength(1);
  expect(seen[0]).toEqual(delta);
});
