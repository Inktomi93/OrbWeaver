// A SillyTavern preset's samplers and limits are judged one field at a time: an in-range value lands as sent, an
// out-of-range or fractional one is brought into the stored range and reported as clamped, a value of the wrong type
// is left out and named, and nothing in one field drops another.
// @subject packages/contracts/src/preset/index.ts

import { tryImportStChatCompletionPreset, userIntentSchema } from "@orb/contracts/preset";
import { expect, test } from "@orb/testkit/node";

const KNOBS = [
  "temperature",
  "topP",
  "topK",
  "frequencyPenalty",
  "presencePenalty",
  "repetitionPenalty",
  "minP",
  "topA",
  "maxOutputTokens",
  "maxContextTokens",
  "seed",
] as const;
type Knob = (typeof KNOBS)[number];

/** Every SillyTavern sampler and limit the importer maps, with its seat here and an in-range value. `offBelow`: at or
 *  below this, SillyTavern itself sends nothing (top_k 0, max tokens 0, seed -1), so the import carries nothing. */
const FIELDS: readonly { readonly st: string; readonly knob: Knob; readonly inRange: number; readonly offBelow?: number }[] = [
  { st: "temperature", knob: "temperature", inRange: 0.9 },
  { st: "top_p", knob: "topP", inRange: 0.95 },
  { st: "top_k", knob: "topK", inRange: 40, offBelow: 0 },
  { st: "frequency_penalty", knob: "frequencyPenalty", inRange: 0.2 },
  { st: "presence_penalty", knob: "presencePenalty", inRange: 0.1 },
  { st: "repetition_penalty", knob: "repetitionPenalty", inRange: 1.1 },
  { st: "min_p", knob: "minP", inRange: 0.05 },
  { st: "top_a", knob: "topA", inRange: 0.2 },
  { st: "openai_max_tokens", knob: "maxOutputTokens", inRange: 800, offBelow: 0 },
  { st: "openai_max_context", knob: "maxContextTokens", inRange: 32_000, offBelow: 0 },
  { st: "seed", knob: "seed", inRange: 7, offBelow: -1 },
];

const PROMPTS = {
  prompts: [{ identifier: "main", name: "Main", content: "You narrate.", role: "system" }],
  ["prompt_order"]: [{ ["character_id"]: 100_001, order: [{ identifier: "main", enabled: true }] }],
};

function bounds(knob: Knob): { readonly min: number; readonly max: number; readonly whole: boolean } {
  const stored = userIntentSchema.shape[knob].unwrap();
  return { min: stored.minValue ?? Number.NEGATIVE_INFINITY, max: stored.maxValue ?? Number.POSITIVE_INFINITY, whole: stored.format === "safeint" };
}

function landedParams(file: Record<string, unknown>): {
  readonly params: Readonly<Record<string, number | undefined>>;
  readonly dropped: readonly unknown[];
} {
  const outcome = tryImportStChatCompletionPreset({ ...PROMPTS, ...file });
  if (!outcome.ok) {
    throw new Error(outcome.reason);
  }
  const { params } = outcome.result.config;
  return {
    params: Object.fromEntries(KNOBS.map((knob) => [knob, params[knob]])),
    dropped: outcome.result.dropped,
  };
}

const fileOf = (value: (field: (typeof FIELDS)[number]) => unknown): Record<string, unknown> =>
  Object.fromEntries(FIELDS.map((field) => [field.st, value(field)]));
const clampedEntry = (field: string, sent: number, landedAs: number): unknown => ({ field, reason: expect.any(String), clamped: { sent, landedAs } });
const leftOutEntry = (field: string): unknown => ({ field, reason: expect.any(String) });

// A whole-number knob with no ceiling of its own is bounded only by the safe integers.
const unbounded = (field: (typeof FIELDS)[number]): boolean => bounds(field.knob).max === Number.MAX_SAFE_INTEGER;

// Past a field's ceiling, or for an unbounded whole-number knob, past the safe integers.
function above(field: (typeof FIELDS)[number]): number {
  return unbounded(field) ? 1e308 : bounds(field.knob).max + 1;
}

test("every sampler and limit in range lands as sent, and an absent one lands nothing", () => {
  expect(landedParams(fileOf(({ inRange }) => inRange))).toEqual({
    params: Object.fromEntries(FIELDS.map(({ knob, inRange }) => [knob, inRange])),
    dropped: [],
  });
  expect(landedParams({})).toEqual({ params: Object.fromEntries(FIELDS.map(({ knob }) => [knob, undefined])), dropped: [] });
});

test("a value below its range is clamped to the range's floor, or carried as nothing where SillyTavern reads it as off", () => {
  const below = (field: (typeof FIELDS)[number]): number => (field.offBelow === undefined ? bounds(field.knob).min - 1 : field.offBelow - 5);
  const { params, dropped } = landedParams(fileOf(below));
  expect(params).toEqual(Object.fromEntries(FIELDS.map((field) => [field.knob, field.offBelow === undefined ? bounds(field.knob).min : undefined])));
  expect(dropped).toEqual(FIELDS.filter((field) => field.offBelow === undefined).map((field) => clampedEntry(field.st, below(field), bounds(field.knob).min)));
});

test("a value above its range, or a fraction where a whole number is stored, is clamped; one past the safe integers is left out", () => {
  const { params, dropped } = landedParams(fileOf(above));
  expect(params).toEqual(Object.fromEntries(FIELDS.map((field) => [field.knob, unbounded(field) ? undefined : bounds(field.knob).max])));
  expect(dropped).toEqual(FIELDS.map((field) => (unbounded(field) ? leftOutEntry(field.st) : clampedEntry(field.st, above(field), bounds(field.knob).max))));
  expect(FIELDS.filter(unbounded).length).toBeGreaterThan(0);

  const whole = FIELDS.filter(({ knob }) => bounds(knob).whole);
  expect(whole.length).toBeGreaterThan(0);
  const fraction = landedParams(Object.fromEntries(whole.map(({ st, inRange }) => [st, inRange + 0.4])));
  expect(fraction.dropped).toEqual(whole.map(({ st, inRange }) => clampedEntry(st, inRange + 0.4, inRange)));
});

test("a value of the wrong type or a non-finite number is left out and named, and lands nothing", () => {
  for (const wrong of ["hot", Number.POSITIVE_INFINITY, true, [1]]) {
    const { params, dropped } = landedParams(fileOf(() => wrong));
    expect({ wrong, params }).toEqual({ wrong, params: Object.fromEntries(FIELDS.map(({ knob }) => [knob, undefined])) });
    expect(dropped).toEqual(FIELDS.map(({ st }) => leftOutEntry(st)));
  }
});

test("one field out of range or of the wrong type drops no other field", () => {
  for (const [i, field] of FIELDS.entries()) {
    const bad = i % 2 === 0 ? "hot" : above(field);
    const { params } = landedParams(fileOf((other) => (other === field ? bad : other.inRange)));
    const others = FIELDS.filter((other) => other !== field);
    expect({ field: field.st, others: others.map(({ knob }) => params[knob]) }).toEqual({ field: field.st, others: others.map(({ inRange }) => inRange) });
  }
});
