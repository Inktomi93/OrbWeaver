// Unit: the chats-pane scope math. Two things no rendered test states as cheaply — the month bound's YEAR
// ROLLOVER (December is the one selection whose exclusive ceiling leaves the selected year, while its
// printed label must not), and the scope key's ALIASING (two different scopes may never produce one key,
// or the virtual list skips the reset and leaves a deep-scrolled reader mid-scope).

import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { chatListScopeKey, formatMonthLabel, monthExclusiveUpperBound } from "../../../../../packages/client/src/features/chat/lib/chat-list-scope.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const ARIA = castId<CharacterId>("char_aria");
const SERA = castId<CharacterId>("char_sera");
const UNSCOPED = { beforeRecencyAt: null, characterId: null, search: "" };

test("the month bound is the first UTC instant of the FOLLOWING month, rolling December into January", () => {
  expect(monthExclusiveUpperBound("2020-06")).toBe(Date.UTC(2020, 6, 1));
  expect(monthExclusiveUpperBound("2020-12")).toBe(Date.UTC(2021, 0, 1));
  expect(monthExclusiveUpperBound("2020-01")).toBe(Date.UTC(2020, 1, 1));
});

test("the December LABEL stays in the selected year — only the bound crosses it", () => {
  const label = formatMonthLabel("2020-12") ?? "";
  expect(label).toContain("2020");
  expect(label).not.toContain("2021");
});

test("a value the native month control cannot produce yields no bound and no label", () => {
  for (const bad of ["", "2020-13", "2020-00", "2020-6", "20-06", "2020-06-01"]) {
    expect(monthExclusiveUpperBound(bad)).toBeNull();
    expect(formatMonthLabel(bad)).toBeNull();
  }
});

// THE #385 PIN at the unit tier: a key that drops an axis is what left a deep-scrolled reader mid-scope,
// and it fails HERE as a collision — the two scopes that differ only in the dropped axis produce one key.
// Verified against a planted axis-dropping implementation, not assumed.
test("every axis moves the scope key, and no two distinct scopes alias into one", () => {
  const keys = [
    chatListScopeKey(UNSCOPED),
    chatListScopeKey({ ...UNSCOPED, characterId: ARIA }),
    chatListScopeKey({ ...UNSCOPED, characterId: SERA }),
    chatListScopeKey({ ...UNSCOPED, search: "aria" }),
    // The unsearched `""` is not the unscoped `null` — an encoding that drops empties aliases these two.
    chatListScopeKey({ ...UNSCOPED, search: "null" }),
    chatListScopeKey({ ...UNSCOPED, beforeRecencyAt: Date.UTC(2021, 0, 1) }),
    chatListScopeKey({ beforeRecencyAt: Date.UTC(2021, 0, 1), characterId: ARIA, search: "aria" }),
  ];
  expect(new Set(keys).size).toBe(keys.length);
});
