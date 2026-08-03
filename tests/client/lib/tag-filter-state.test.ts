// The three-state tag-filter axis. The load-bearing invariants: the cycle CLOSES (off → include → exclude
// → off, four clicks return you to where you started — a cycle that skips a state strands a user who can
// never turn a chip off), `off` is stored as the ABSENCE of an entry (an inert `off` row would accumulate
// in the persisted blob forever), and cycling one tag leaves every other entry untouched.

import type { TagFilterEntry } from "@orb/client/lib";
import { cycleTagFilterEntries, tagFilterStateOf } from "@orb/client/lib";
import type { TagId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures";

const RPG = castId<TagId>("tag_rpg");
const NOIR = castId<TagId>("tag_noir");

test("the cycle closes: off → include → exclude → off", () => {
  let entries: readonly TagFilterEntry[] = [];
  expect(tagFilterStateOf(entries, RPG)).toBe("off");

  entries = cycleTagFilterEntries(entries, RPG);
  expect(tagFilterStateOf(entries, RPG)).toBe("include");

  entries = cycleTagFilterEntries(entries, RPG);
  expect(tagFilterStateOf(entries, RPG)).toBe("exclude");

  entries = cycleTagFilterEntries(entries, RPG);
  expect(tagFilterStateOf(entries, RPG)).toBe("off");
  // `off` is the absence of a row, never a stored one.
  expect(entries).toEqual([]);
});

test("cycling one tag leaves the other entries alone", () => {
  const withNoir = cycleTagFilterEntries([], NOIR);
  const both = cycleTagFilterEntries(cycleTagFilterEntries(withNoir, RPG), RPG);
  expect(tagFilterStateOf(both, NOIR)).toBe("include");
  expect(tagFilterStateOf(both, RPG)).toBe("exclude");
  expect(both).toHaveLength(2);
});
