import type { StatsDelta } from "@orb/contracts/stats";
import { statsDeltaSchema } from "@orb/contracts/stats";
import type { UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { statsBucketStart } from "@orb/kit/stats-tally";
import { FROZEN_AT_MS } from "@orb/testkit/iso/clock.ts";
import { testModelId, testProviderId } from "@orb/testkit/iso/inference-identities.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

// Sample keys: a low-entropy owner brand at the untyped seam + a minted character TypeID (no pasted
// high-entropy literals — noSecrets). The bucket grain is what `@orb/kit/stats-tally.statsBucketStart` emits.
const OWNER_ID = castId<UserId>("user-owner");
const CHARACTER_ID = mintTypeId(ID_PREFIX.character);
const BUCKET_START = statsBucketStart(FROZEN_AT_MS);
const MODEL = testModelId("claude-opus-4");
const PROVIDER = testProviderId("anthropic");

test("statsDeltaSchema parses the minimal grain-only delta and round-trips (no defaults injected)", () => {
  // The required floor: keys + grain + the `now` computedAt stamp; every increment omitted.
  const value = {
    ownerId: OWNER_ID,
    characterId: CHARACTER_ID,
    bucketStart: BUCKET_START,
    model: MODEL,
    provider: PROVIDER,
    now: FROZEN_AT_MS,
  };
  const parsed = statsDeltaSchema.parse(value);
  // No `.default()` anywhere → an omitted increment stays absent (the delta is a sparse patch); a
  // round-trip that silently grew `tokensIn: 0` keys would double-count under `col = col + excluded.col`.
  expect(parsed).toEqual(value);
  expect(Object.keys(parsed).sort()).toEqual(["bucketStart", "characterId", "model", "now", "ownerId", "provider"].sort());
});

test("a MESSAGE delta carries the scalar + daily + model slices together and round-trips", () => {
  const value: StatsDelta = {
    ownerId: OWNER_ID,
    characterId: CHARACTER_ID,
    bucketStart: BUCKET_START,
    model: MODEL,
    provider: PROVIDER,
    now: FROZEN_AT_MS,
    assistantTurns: 1,
    assistantWords: 42,
    contentChars: 6,
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

// the stats design doc esoteric #1 — the 3-slice decoupling: a VARIANT (swipe) bumps scalar tokens but must NOT
// credit the daily token slice (daily credits the MESSAGE stream only), else a re-rolled turn
// double-counts daily tokens. The schema must ACCEPT a delta that sets scalar tokens while omitting
// `dailyTokensIn`/`dailyTokensOut`.
test("a VARIANT delta sets scalar tokens but OMITS the daily token slice (decoupling pin)", () => {
  const value: StatsDelta = {
    ownerId: OWNER_ID,
    characterId: CHARACTER_ID,
    bucketStart: BUCKET_START,
    model: MODEL,
    provider: PROVIDER,
    now: FROZEN_AT_MS,
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
    bucketStart: BUCKET_START,
    model: testModelId("claude-sonnet-4"),
    provider: PROVIDER,
    now: FROZEN_AT_MS,
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
    bucketStart: BUCKET_START,
    model: null, // no-model write → model_stats skipped
    provider: null,
    now: FROZEN_AT_MS,
    systemTurns: 1,
  };
  expect(statsDeltaSchema.parse(value)).toEqual(value);
});

// Maintenance extrema: nullable AND optional; negative increments are legal (a delete emits new − old).
test("maintenance extrema (firstAt/lastAt/maxContextTokens) accept nulls; increments accept negatives", () => {
  const value: StatsDelta = {
    ownerId: OWNER_ID,
    characterId: CHARACTER_ID,
    bucketStart: BUCKET_START,
    model: null,
    provider: null,
    now: FROZEN_AT_MS,
    newCharacter: true,
    firstAt: FROZEN_AT_MS,
    lastAt: null,
    maxContextTokens: null,
    // a delete delta walks the totals back down — negative is intentional, not rejected.
    assistantTurns: -1,
    contentChars: -6,
    tokensOut: -800,
  };
  expect(statsDeltaSchema.parse(value)).toEqual(value);
});

// #1147 — the ROOM COUNT is grain-split like the token slices: `chats` is the OWNER's library count,
// `characterChats` the per-character seat census. A room with N character seats emits ONE delta carrying
// both and N−1 SEAT deltas carrying only the character half, so the schema must accept a delta that sets
// `characterChats` while OMITTING `chats` — the shape that credits a second seat without inflating the
// owner's library (the decoupling pin above, on the chat axis).
test("a SEAT delta sets the character room census but OMITS the owner chat count (grain-split pin)", () => {
  const value: StatsDelta = {
    ownerId: OWNER_ID,
    characterId: CHARACTER_ID,
    bucketStart: BUCKET_START,
    model: null,
    provider: null,
    now: FROZEN_AT_MS,
    characterChats: 1,
    characterForkedChats: 1,
    firstAt: FROZEN_AT_MS,
    lastAt: FROZEN_AT_MS,
  };
  const parsed = statsDeltaSchema.parse(value);
  expect(parsed).toEqual(value);
  expect(parsed.chats).toBeUndefined();
  expect(parsed.chatsCreated).toBeUndefined();
});

test("statsDeltaSchema rejects a delta missing the required `now` stamp", () => {
  const invalid = {
    ownerId: OWNER_ID,
    characterId: CHARACTER_ID,
    bucketStart: BUCKET_START,
    model: null,
    provider: null,
  };
  expect(statsDeltaSchema.safeParse(invalid).success).toBe(false);
});

test("model_stats.model producer rejects a blank foreign model id", () => {
  expect(
    statsDeltaSchema.safeParse({
      ownerId: OWNER_ID,
      characterId: CHARACTER_ID,
      bucketStart: BUCKET_START,
      model: "   ",
      provider: "anthropic",
      now: FROZEN_AT_MS,
    }).success,
  ).toBe(false);
});

test("model_stats.provider producer rejects malformed registry ids and admits only the ruled unknown sentinel", () => {
  const base = { ownerId: OWNER_ID, characterId: CHARACTER_ID, bucketStart: BUCKET_START, model: "claude-opus-4", now: FROZEN_AT_MS };
  expect(statsDeltaSchema.safeParse({ ...base, provider: "custom_openai" }).success).toBe(false);
  expect(statsDeltaSchema.safeParse({ ...base, provider: "(unknown)" }).success).toBe(true);
});

test("statsDeltaSchema rejects an empty ownerId and a wrong-prefix characterId", () => {
  const emptyOwner = {
    ownerId: "",
    characterId: CHARACTER_ID,
    bucketStart: BUCKET_START,
    model: null,
    provider: null,
    now: FROZEN_AT_MS,
  };
  expect(statsDeltaSchema.safeParse(emptyOwner).success).toBe(false);
  // A persona id where a character id is required — the branded prefix check rejects it.
  const wrongPrefix = {
    ownerId: OWNER_ID,
    characterId: mintTypeId(ID_PREFIX.persona),
    bucketStart: BUCKET_START,
    model: null,
    provider: null,
    now: FROZEN_AT_MS,
  };
  expect(statsDeltaSchema.safeParse(wrongPrefix).success).toBe(false);
});

test("statsDeltaSchema rejects a non-numeric increment", () => {
  const value = {
    ownerId: OWNER_ID,
    characterId: CHARACTER_ID,
    bucketStart: BUCKET_START,
    model: null,
    provider: null,
    now: FROZEN_AT_MS,
    tokensIn: "1200",
  };
  expect(statsDeltaSchema.safeParse(value).success).toBe(false);
});
