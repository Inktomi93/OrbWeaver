// Mirror unit test for domain/rpg/substrate/hidden-spans — the walk the member-facing reads AND the
// member→host fork both run (#1528/#1398). What is pinned here is the walk's SHAPE, because that is what
// makes it safe to point at a whole payload: it reaches every string at any depth (so a new free-text field
// inherits the belt), it does NOT rewrite object KEYS (`fieldLocks` keys are addresses — a mangled path
// silently unlocks a hand-locked field), it leaves non-strings alone, and it is IDENTITY for a viewer who
// reads hidden. The span vocabulary itself belongs to `@orb/kit/content` and is pinned there.

import { describe } from "vitest";
import { stripHiddenDeep, stripHiddenForViewer } from "../../../../../packages/server/src/domain/rpg/substrate/hidden-spans.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const HIDDEN = '<lie character="Mara" truth="she is the informant"/>';
const TRUTH = "she is the informant";

describe("stripHiddenDeep", () => {
  test("reaches every string at any depth — through arrays, nested objects and record values", () => {
    const payload = {
      location: `The docks ${HIDDEN}`,
      quests: [{ name: `Find the key ${HIDDEN}`, objectives: [{ text: `open the ${HIDDEN}vault` }] }],
      actors: { "npc:mara": { volatile: { inventory: [{ description: `taken from ${HIDDEN}` }] } } },
    };

    const stripped = stripHiddenDeep(payload);

    expect(JSON.stringify(stripped)).not.toContain(TRUTH);
    // Asserted as ONE structure rather than by index: the claim is that the whole payload came back belted at
    // every depth, and an indexed read of a possibly-empty array would need a narrowing dance to say it.
    expect(stripped).toEqual({
      location: "The docks ",
      quests: [{ name: "Find the key ", objectives: [{ text: "open the vault" }] }],
      actors: { "npc:mara": { volatile: { inventory: [{ description: "taken from " }] } } },
    });
    // The input is never mutated — a live snapshot read and a cloned row both depend on that.
    expect(payload.location).toBe(`The docks ${HIDDEN}`);
  });

  test("object KEYS are never rewritten — a lock path survives the walk verbatim", () => {
    // `fieldLocks` keys are ADDRESSES. A key mangled by the strip would silently release a hand-locked field.
    const locks = { [`actorState.npc:mara.mood${HIDDEN}`]: 1, "quests.q1": 1 };

    expect(Object.keys(stripHiddenDeep(locks))).toEqual([`actorState.npc:mara.mood${HIDDEN}`, "quests.q1"]);
  });

  test("non-strings pass through untouched (ids, numbers, booleans, null)", () => {
    const payload = { seq: 4, ok: true, at: null, id: "rpg_journal_01", tags: [1, 2, 3] };

    expect(stripHiddenDeep(payload)).toEqual(payload);
  });
});

describe("stripHiddenForViewer", () => {
  test("a viewer who READS HIDDEN gets the payload back byte-identical (identity, not a walk)", () => {
    const payload = { location: `The docks ${HIDDEN}` };

    expect(stripHiddenForViewer(payload, true)).toBe(payload);
    expect(stripHiddenForViewer(payload, false).location).toBe("The docks ");
  });
});
