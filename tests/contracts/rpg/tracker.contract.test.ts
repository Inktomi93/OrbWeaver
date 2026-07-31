// @orb/contracts/rpg/tracker — THE tracked-field unification (`docs/design/tracked-field-unification.md` §5).
// Pins the shapes the whole lane rests on: the def's axes + defaults, the TOTAL value (and the absence of a
// second `max` — the drift class the merge killed), and above all the ONE carrier predicate
// (`resolve(appliesTo) + grants − revokes`) that every consumer derives from instead of re-deciding who
// carries what. The R6 write-surface GROUPING + the schema projection it feeds are pinned next door in
// `extraction.contract.test.ts` (they are a property of the projected schema, not of these shapes).

import type { RpgTrackerCarrier, RpgTrackerDef } from "@orb/contracts/rpg";
import {
  carriesTracker,
  gameTrackers,
  RPG_TRACKER_VALUE_EMPTY,
  resolveTrackerCarriers,
  rpgTrackerDefSchema,
  rpgTrackerValueSchema,
  sortTrackers,
  trackerGloss,
  trackerNumber,
  trackerReading,
  trackersForCarrier,
} from "@orb/contracts/rpg";
import { expect, test } from "../../support/fixtures";

/** A def with the axes a case cares about; everything else takes its schema default. */
function def(over: Partial<RpgTrackerDef> & Pick<RpgTrackerDef, "key" | "label" | "shape" | "write" | "subject">): RpgTrackerDef {
  return rpgTrackerDefSchema.parse(over);
}

/** A carrier (an actor a tracker may land on), with no sheet exceptions unless given. */
function carrier(name: string, kind: "party" | "npcs", over: Partial<RpgTrackerCarrier> = {}): RpgTrackerCarrier {
  return { actorKey: `${kind === "npcs" ? "cast" : "user"}:${name}`, name, kind, grants: [], revokes: [], ...over };
}

test("the def parses its axes and defaults the rest (a minimal def is legal — the add flow supplies four fields)", () => {
  const minimal = def({ key: "grit", label: "Grit", shape: "meter", write: "delta", subject: "actor" });
  expect(minimal.appliesTo).toBe("everyone");
  expect(minimal.max).toBeNull();
  expect(minimal.hint).toBe("");
  expect(minimal.color).toBeNull();
  expect(minimal.pinned).toBe(false);
  expect(minimal.locked).toBe(false);
});

test("the def's axes are CLOSED vocabularies (an off-axis token never parses)", () => {
  const base = { key: "k", label: "L", shape: "meter", write: "delta", subject: "actor" };
  expect(rpgTrackerDefSchema.safeParse({ ...base, shape: "gauge" }).success).toBe(false);
  expect(rpgTrackerDefSchema.safeParse({ ...base, write: "increment" }).success).toBe(false);
  expect(rpgTrackerDefSchema.safeParse({ ...base, subject: "scene" }).success).toBe(false);
  expect(rpgTrackerDefSchema.safeParse({ ...base, appliesTo: "villains" }).success).toBe(false);
  // The explicit arm is an ACTOR-REF KEY list (the one string projection every map/lock already keys on).
  expect(rpgTrackerDefSchema.parse({ ...base, appliesTo: ["cast:demon"] }).appliesTo).toEqual(["cast:demon"]);
});

test("a stored color must pass the strict hex/OKLCH grammar (never raw CSS reaching a style attribute)", () => {
  const base = { key: "k", label: "L", shape: "meter", write: "delta", subject: "actor" };
  expect(rpgTrackerDefSchema.safeParse({ ...base, color: "#5b8cff" }).success).toBe(true);
  expect(rpgTrackerDefSchema.safeParse({ ...base, color: "oklch(0.7 0.15 250)" }).success).toBe(true);
  expect(rpgTrackerDefSchema.safeParse({ ...base, color: "var(--x)" }).success).toBe(false);
  expect(rpgTrackerDefSchema.safeParse({ ...base, color: "red" }).success).toBe(false);
});

test("the VALUE is total and carries NO max — the ceiling has exactly one home (the def)", () => {
  const parsed = rpgTrackerValueSchema.parse({});
  expect(parsed).toEqual(RPG_TRACKER_VALUE_EMPTY);
  expect(parsed).toEqual({ value: null, items: null });
  // The retired shape kept a max on the sheet def AND on the volatile pool; the read had to clamp one
  // against the other so two tabs agreed. There is no second max to drift from now.
  expect("max" in parsed).toBe(false);
  expect(rpgTrackerValueSchema.parse({ value: 5 })).toEqual({ value: 5, items: null });
  expect(rpgTrackerValueSchema.parse({ value: "guarded" }).value).toBe("guarded");
});

// ── THE CARRIER MATRIX (the one predicate every consumer derives from) ─────────────────────────────────

test("carrier CLASSES: party covers roster actors, npcs covers scene cast, everyone covers both", () => {
  const kael = carrier("Kael", "party");
  const mira = carrier("Mira", "npcs");
  const party = def({ key: "mana", label: "Mana", shape: "meter", write: "delta", subject: "actor", appliesTo: "party" });
  const npcs = def({ key: "trust", label: "Trust", shape: "text", write: "set", subject: "actor", appliesTo: "npcs" });
  const everyone = def({ key: "doom", label: "Doom", shape: "meter", write: "set", subject: "actor", appliesTo: "everyone" });
  expect([carriesTracker(party, kael), carriesTracker(party, mira)]).toEqual([true, false]);
  expect([carriesTracker(npcs, kael), carriesTracker(npcs, mira)]).toEqual([false, true]);
  expect([carriesTracker(everyone, kael), carriesTracker(everyone, mira)]).toEqual([true, true]);
});

test("an EXPLICIT appliesTo list matches by actor-ref KEY, never by display name (a rename never orphans it)", () => {
  const bound = def({ key: "bound_will", label: "Bound Will", shape: "meter", write: "delta", subject: "actor", appliesTo: ["cast:demon"] });
  expect(carriesTracker(bound, carrier("demon", "npcs"))).toBe(true);
  // Same DISPLAY name, different ref key ⇒ not a carrier (the key is the identity).
  expect(carriesTracker(bound, { ...carrier("demon", "npcs"), actorKey: "cast:demon_2" })).toBe(false);
});

test("a GRANT reaches an actor the class missed; a REVOKE beats the class AND a grant", () => {
  const npcOnly = def({ key: "bound_will", label: "Bound Will", shape: "meter", write: "delta", subject: "actor", appliesTo: "npcs" });
  const everyone = def({ key: "mana", label: "Mana", shape: "meter", write: "delta", subject: "actor", appliesTo: "everyone" });
  expect(carriesTracker(npcOnly, carrier("Kael", "party", { grants: ["bound_will"] }))).toBe(true);
  expect(carriesTracker(everyone, carrier("Sera", "party", { revokes: ["mana"] }))).toBe(false);
  // A revoke wins even against an explicit grant — it is the host saying "not this one, not on them".
  expect(carriesTracker(everyone, carrier("Sera", "party", { grants: ["mana"], revokes: ["mana"] }))).toBe(false);
});

test("a GAME-subject tracker has no carriers at all (it is one reading on the snapshot)", () => {
  const alarm = def({ key: "alarm", label: "Alarm", shape: "meter", write: "set", subject: "game", appliesTo: "everyone" });
  expect(carriesTracker(alarm, carrier("Kael", "party"))).toBe(false);
  expect(resolveTrackerCarriers(alarm, [carrier("Kael", "party"), carrier("Mira", "npcs")])).toEqual([]);
  expect(gameTrackers([alarm]).map((d) => d.key)).toEqual(["alarm"]);
});

test("the two read directions agree — who carries THIS tracker, and what does THIS actor carry", () => {
  const mana = def({ key: "mana", label: "Mana", shape: "meter", write: "delta", subject: "actor", appliesTo: "party" });
  const trust = def({ key: "trust", label: "Trust", shape: "text", write: "set", subject: "actor", appliesTo: "npcs" });
  const kael = carrier("Kael", "party");
  const sera = carrier("Sera", "party", { revokes: ["mana"] });
  const mira = carrier("Mira", "npcs");
  expect(resolveTrackerCarriers(mana, [kael, sera, mira]).map((c) => c.name)).toEqual(["Kael"]);
  expect(trackersForCarrier([mana, trust], kael).map((d) => d.key)).toEqual(["mana"]);
  expect(trackersForCarrier([mana, trust], sera)).toEqual([]);
  expect(trackersForCarrier([mana, trust], mira).map((d) => d.key)).toEqual(["trust"]);
});

test("tracker ORDER is total and stable — `sort`, then key (never set-insertion order)", () => {
  const a = def({ key: "zeta", label: "Zeta", shape: "meter", write: "set", subject: "game", sort: 1 });
  const b = def({ key: "alpha", label: "Alpha", shape: "meter", write: "set", subject: "game", sort: 1 });
  const c = def({ key: "omega", label: "Omega", shape: "meter", write: "set", subject: "game", sort: 0 });
  expect(sortTrackers([a, b, c]).map((d) => d.key)).toEqual(["omega", "alpha", "zeta"]);
});

// ── THE ONE GLOSS (the R4b lever, on every model-facing surface) ────────────────────────────────────────

test("the gloss is `label value/max (hint)` — shape-aware, and SILENT on an unset tracker", () => {
  const meter = def({ key: "mana", label: "Mana", shape: "meter", write: "delta", subject: "actor", max: 10, hint: "fuels spellcasting" });
  expect(trackerGloss(meter, { value: 5, items: null })).toBe("Mana 5/10 (fuels spellcasting)");
  // No hint ⇒ no empty parens (the reading alone).
  expect(trackerGloss({ ...meter, hint: "" }, { value: 5, items: null })).toBe("Mana 5/10");
  // No ceiling ⇒ the bare reading.
  expect(trackerReading({ ...meter, max: null, hint: "" }, { value: 5, items: null })).toBe("Mana 5");
  // UNSET ⇒ null, never `Mana null` (an unset tracker carries no steering signal).
  expect(trackerGloss(meter, RPG_TRACKER_VALUE_EMPTY)).toBeNull();
  expect(trackerGloss(meter, undefined)).toBeNull();
});

test("the gloss reads text + list shapes in the same grammar", () => {
  const text = def({ key: "trust", label: "Trust", shape: "text", write: "set", subject: "actor", hint: "where they stand" });
  expect(trackerGloss(text, { value: "guarded", items: null })).toBe("Trust: guarded (where they stand)");
  const list = def({ key: "pack", label: "Pack", shape: "list", write: "set", subject: "actor" });
  expect(trackerGloss(list, { value: null, items: ["rope", "torch"] })).toBe("Pack: rope, torch");
  // An EMPTY list is unset, not an empty line.
  expect(trackerGloss(list, { value: null, items: [] })).toBeNull();
});

test("trackerNumber is the ONE narrowing of the stored union — a string meter never renders NaN", () => {
  // A hand edit or a model writing "5" must still drive a bar; anything genuinely non-numeric reads null
  // (the caller then omits the row rather than painting a NaN geometry).
  expect(trackerNumber({ value: 5, items: null })).toBe(5);
  expect(trackerNumber({ value: "5", items: null })).toBe(5);
  expect(trackerNumber({ value: "guarded", items: null })).toBeNull();
  expect(trackerNumber({ value: null, items: null })).toBeNull();
  expect(trackerNumber(undefined)).toBeNull();
});
