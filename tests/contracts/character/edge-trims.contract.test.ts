// The slug and handle edge trims keep the keys they minted before: they address rows already stored.
// @subject packages/contracts/src/rpg/actor.ts
// @subject packages/contracts/src/import/index.ts

import { chatDirCardCandidates } from "@orb/contracts/import";
import { rpgNpcSlug } from "@orb/contracts/rpg";
import { expect, test } from "@orb/testkit/node";

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

test("a long run of hyphens at the end of a slug is trimmed in linear time", () => {
  const started = performance.now();
  expect(chatDirCardCandidates(`aria${"-".repeat(300_000)}9`)).toEqual(["aria"]);
  expect(rpgNpcSlug(`a${"-".repeat(300_000)}`)).toBe("a");
  expect(performance.now() - started).toBeLessThan(1000);
});
