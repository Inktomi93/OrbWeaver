import { modelKey, STATS_BUCKET_MS, statsBucketStart, wordCount } from "@orb/kit/stats-tally";
import { expect, test } from "../../support/fixtures.ts";

test("wordCount matches ST's \\b\\w+\\b semantics", () => {
  expect(wordCount("hello world")).toBe(2);
  expect(wordCount("foo, bar! baz?")).toBe(3); // punctuation is not a word char
  expect(wordCount("it's a test")).toBe(4); // apostrophe splits → it, s, a, test
  expect(wordCount("under_score")).toBe(1); // underscore IS a word char
});

test("wordCount treats empty / nullish as zero", () => {
  expect(wordCount("")).toBe(0);
  expect(wordCount("   ")).toBe(0);
  expect(wordCount(null)).toBe(0);
  expect(wordCount(undefined)).toBe(0);
});

test("statsBucketStart floors an epoch-ms to the start of its UTC quarter-hour", () => {
  const start = Date.UTC(2024, 0, 1, 23, 45, 0);
  expect(statsBucketStart(start)).toBe(start);
  expect(statsBucketStart(start + STATS_BUCKET_MS - 1)).toBe(start);
  expect(statsBucketStart(start + STATS_BUCKET_MS)).toBe(Date.UTC(2024, 0, 2, 0, 0, 0));
  // Kathmandu (+5:45) local midnight is 18:15 UTC: a bucket boundary, so no bucket straddles its day.
  expect(statsBucketStart(Date.UTC(2024, 0, 1, 18, 15, 0))).toBe(Date.UTC(2024, 0, 1, 18, 15, 0));
});

test("modelKey defaults a present model with no provider to (unknown)", () => {
  expect(modelKey("gpt-4", "openai")).toEqual({ model: "gpt-4", provider: "openai" });
  expect(modelKey("gpt-4", null)).toEqual({ model: "gpt-4", provider: "(unknown)" });
});

test("modelKey nulls the provider when the model is null (no model_stats row)", () => {
  expect(modelKey(null, "openai")).toEqual({ model: null, provider: null });
  expect(modelKey(null, null)).toEqual({ model: null, provider: null });
});
