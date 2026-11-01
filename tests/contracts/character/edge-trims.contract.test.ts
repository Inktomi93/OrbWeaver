// The slug and handle edge trims keep the keys they minted before: they address rows already stored.
// @subject packages/contracts/src/rpg/actor.ts
// @subject packages/contracts/src/import/index.ts

import { chatDirCardCandidates } from "@orb/contracts/import";
import { rpgNpcSlug } from "@orb/contracts/rpg";
import { SLUG_HANDLE_PATTERN, slugifyHandle } from "@orb/kit/slug";
import { expect, test } from "@orb/testkit/node";

test.each([
  ["trailing punctuation", "Aria!!", "aria"],
  ["leading punctuation and a stranded mark", "-́-Aria", "aria"],
  ["a trailing mark stays", "का-", "का"],
])("handle edges: %s", (_name, name, handle) => {
  expect(slugifyHandle(name)).toBe(handle);
});

test("a truncation that lands on a separator leaves one hyphen before its tag", () => {
  const handle = slugifyHandle(`${"a".repeat(63)} ${"b".repeat(30)}`);
  expect(handle).toMatch(SLUG_HANDLE_PATTERN);
  expect(handle.startsWith(`${"a".repeat(63)}-`)).toBe(true);
  expect(handle.slice(63)).not.toContain("--");
});

test.each([
  ["punctuation at both edges", "  --Aria!!  ", "aria"],
  ["an inner separator run", "Mira -- Lane", "mira-lane"],
  ["a name of separators only falls back", "!!!", "unnamed+21+21+21"],
])("npc slug: %s", (_name, name, slug) => {
  expect(rpgNpcSlug(name)).toBe(slug);
});

test.each([
  ["a folder with a trailing count", "aria-12", ["aria"]],
  ["the spec wrapper", "main-aria-spec-v2", ["main-aria-spec-v", "aria"]],
  ["a bare card slug has no candidate", "aria", []],
])("chat directory candidates: %s", (_name, slug, candidates) => {
  expect(chatDirCardCandidates(slug)).toEqual(candidates);
});

test("a long inner run of hyphens is read in linear time", () => {
  const started = performance.now();
  expect(chatDirCardCandidates(`aria${"-".repeat(300_000)}x`)).toEqual([]);
  expect(performance.now() - started).toBeLessThan(1000);
});
