// Unit: `presetRowSubtitle` (features/preset/lib/preset-row-view) — the F5 fix. Nine rows all titled
// "Default (edited)" carried NO subtitle, so the library was unpickable; the subtitle is now the edit stamp
// (+ the kind, when the kind says anything). `formatRelative` is injected, so this is deterministic.

import { presetRowSubtitle } from "../../../../../packages/client/src/features/preset/lib/preset-row-view";
import { expect, test } from "../../../../support/fixtures";

const formatRelative = (epochMs: number): string => `T-${epochMs}`;

test("the ordinary case is the edit stamp alone", () => {
  expect(presetRowSubtitle("generation", 42, formatRelative)).toBe("edited T-42");
});

test("the built-in's own kind is NOT printed — a copy-on-write fork inherits it and 'system' is noise", () => {
  expect(presetRowSubtitle("system", 7, formatRelative)).toBe("edited T-7");
});

test("a kind that carries scent leads the subtitle", () => {
  expect(presetRowSubtitle("rpg-gm", 7, formatRelative)).toBe("rpg-gm · edited T-7");
  expect(presetRowSubtitle("roleplay", 7, formatRelative)).toBe("roleplay · edited T-7");
});
