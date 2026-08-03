import { modelKey, utcDay, wordCount } from "@orb/kit/stats-tally";
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

test("utcDay buckets an epoch-ms to its UTC calendar day", () => {
  expect(utcDay(0)).toBe("1970-01-01");
  expect(utcDay(1_700_000_000_000)).toBe("2023-11-14");
  // Just before midnight UTC vs just after — same instant family, different day.
  expect(utcDay(Date.UTC(2024, 0, 1, 23, 59, 59))).toBe("2024-01-01");
  expect(utcDay(Date.UTC(2024, 0, 2, 0, 0, 0))).toBe("2024-01-02");
});

test("modelKey defaults a present model with no provider to (unknown)", () => {
  expect(modelKey("gpt-4", "openai")).toEqual({ model: "gpt-4", provider: "openai" });
  expect(modelKey("gpt-4", null)).toEqual({ model: "gpt-4", provider: "(unknown)" });
});

test("modelKey nulls the provider when the model is null (no model_stats row)", () => {
  expect(modelKey(null, "openai")).toEqual({ model: null, provider: null });
  expect(modelKey(null, null)).toEqual({ model: null, provider: null });
});
