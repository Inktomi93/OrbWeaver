import { normalizeTagName, tagMatchKey } from "@orb/kit/tag";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

test("normalizeTagName trims leading/trailing whitespace", () => {
  expect(normalizeTagName("  Female  ")).toBe("Female");
});

test("normalizeTagName collapses internal whitespace runs to a single space", () => {
  expect(normalizeTagName("Female   Knight")).toBe("Female Knight");
  expect(normalizeTagName("a\t\tb\n c")).toBe("a b c");
});

test("normalizeTagName KEEPS display casing (case-insensitive dedupe is the uniqueness layer's job)", () => {
  expect(normalizeTagName("NSFW")).toBe("NSFW");
  expect(normalizeTagName("DnD")).toBe("DnD");
  expect(normalizeTagName(" Female ")).not.toBe(normalizeTagName(" female ")); // case preserved
});

test("normalizeTagName folds whitespace-only / empty to the empty string (the chokepoint's no-op signal)", () => {
  expect(normalizeTagName("")).toBe("");
  expect(normalizeTagName("   ")).toBe("");
  expect(normalizeTagName("\t\n ")).toBe("");
});

test("normalizeTagName leaves an already-canonical name untouched (idempotent)", () => {
  const canonical = "Female Knight";
  expect(normalizeTagName(canonical)).toBe(canonical);
  expect(normalizeTagName(normalizeTagName("  Female   Knight  "))).toBe(canonical);
});

test("tagMatchKey makes case, spacing and punctuation variants of one label match", () => {
  expect(tagMatchKey("Slice of Life")).toBe(tagMatchKey("slice-of-life"));
  expect(tagMatchKey("Slice of Life")).not.toBe(tagMatchKey("Slice of Death"));
});
