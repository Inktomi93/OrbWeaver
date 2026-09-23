// @orb/contracts/rpg/tracker — THE tracked-field unification.
// Pins the shapes the whole lane rests on: the def's axes + defaults, the TOTAL value (whose `max` is the
// PER-CARRIER ceiling OVERRIDE — owner amendment 2026-07-31: the def's max is the DEFAULT, and the old drift
// class is killed by the anti-drift write rule `resolveTrackerMaxOverride`, not by absence), the ONE ceiling
// resolver `trackerCeiling`, and above all the ONE carrier predicate
// (`resolve(appliesTo) + grants − revokes`) that every consumer derives from instead of re-deciding who
// carries what. The R6 write-surface GROUPING + the schema projection it feeds are pinned next door in
// `extraction.contract.test.ts` (they are a property of the projected schema, not of these shapes).

import type { RpgTrackerCarrier, RpgTrackerDef } from "@orb/contracts/rpg";
import {
  carriesTracker,
  gameTrackers,
  RPG_TRACKER_VALUE_EMPTY,
  resolveTrackerCarriers,
  resolveTrackerMaxOverride,
  rpgTrackerDefSchema,
  rpgTrackerValueSchema,
  sortTrackers,
  trackerCeiling,
  trackerGloss,
  trackerNumber,
  trackerReading,
  trackersForCarrier,
} from "@orb/contracts/rpg";
import { expect, test } from "../../support/fixtures.ts";

/** A def with the axes a case cares about; everything else takes its schema default. */
function def(over: Partial<RpgTrackerDef> & Pick<RpgTrackerDef, "key" | "label" | "shape" | "write" | "subject">): RpgTrackerDef {
  return rpgTrackerDefSchema.parse(over);
}

/** A carrier (an actor a tracker may land on), with no sheet exceptions unless given. */
function carrier(name: string, kind: "party" | "npcs", over: Partial<RpgTrackerCarrier> = {}): RpgTrackerCarrier {
  return { actorKey: `${kind === "npcs" ? "npc" : "user"}:${name}`, name, kind, grants: [], revokes: [], ...over };
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
  expect(rpgTrackerDefSchema.parse({ ...base, appliesTo: ["npc:demon"] }).appliesTo).toEqual(["npc:demon"]);
});

test("a stored color must pass the strict hex/OKLCH grammar (never raw CSS reaching a style attribute)", () => {
  const base = { key: "k", label: "L", shape: "meter", write: "delta", subject: "actor" };
  expect(rpgTrackerDefSchema.safeParse({ ...base, color: "#5b8cff" }).success).toBe(true);
  expect(rpgTrackerDefSchema.safeParse({ ...base, color: "oklch(0.7 0.15 250)" }).success).toBe(true);
  expect(rpgTrackerDefSchema.safeParse({ ...base, color: "var(--x)" }).success).toBe(false);
  expect(rpgTrackerDefSchema.safeParse({ ...base, color: "red" }).success).toBe(false);
});

test("the VALUE is total; its `max` is the PER-CARRIER ceiling override, born absent (owner amendment)", () => {
  const parsed = rpgTrackerValueSchema.parse({});
  expect(parsed).toEqual(RPG_TRACKER_VALUE_EMPTY);
  expect(parsed).toEqual({ value: null, items: null, max: null });
  // Absent = "follow the def's default ceiling". A number = "this carrier is deliberately different"
  // (Kael's Vitality tops out higher than the party default — the d20 max-HP reality).
  expect(rpgTrackerValueSchema.parse({ value: 5 })).toEqual({ value: 5, items: null, max: null });
  expect(rpgTrackerValueSchema.parse({ value: 5, max: 34 }).max).toBe(34);
  // The `max ≥ 1` floor is the same one the def carries — an override can never be a zero ceiling.
  expect(rpgTrackerValueSchema.safeParse({ max: 0 }).success).toBe(false);
  expect(rpgTrackerValueSchema.parse({ value: "guarded" }).value).toBe("guarded");
});

test("trackerCeiling is the ONE fallback: the override wins, absence falls to the def, both null = uncapped", () => {
  const vit = def({ key: "vit", label: "Vitality", shape: "meter", write: "delta", subject: "actor", max: 30 });
  expect(trackerCeiling(vit, { value: 24, items: null, max: null })).toBe(30);
  expect(trackerCeiling(vit, { value: 24, items: null, max: 34 })).toBe(34);
  expect(trackerCeiling(vit, undefined)).toBe(30);
  expect(trackerCeiling({ ...vit, max: null }, { value: 1, items: null, max: null })).toBeNull();
  // The READING the model is taught follows the effective ceiling, never the party default a carrier left.
  expect(trackerReading(vit, { value: 24, items: null, max: 34 })).toBe("Vitality 24/34");
  expect(trackerGloss({ ...vit, hint: "how much you can take" }, { value: 24, items: null, max: 34 })).toBe("Vitality 24/34 (how much you can take)");
});

test("resolveTrackerMaxOverride is the ANTI-DRIFT rule: equal-to-default CLEARS, different STORES, floor is 1", () => {
  const vit = def({ key: "vit", label: "Vitality", shape: "meter", write: "delta", subject: "actor", max: 30 });
  // Writing the default back is how a host un-overrides — the number is never stored twice.
  expect(resolveTrackerMaxOverride(vit, 30)).toBeNull();
  expect(resolveTrackerMaxOverride(vit, null)).toBeNull();
  expect(resolveTrackerMaxOverride(vit, 34)).toBe(34);
  expect(resolveTrackerMaxOverride(vit, 0)).toBe(1);
  // On an uncapped def, any number is a genuine override (there is no default to collapse into).
  expect(resolveTrackerMaxOverride({ ...vit, max: null }, 12)).toBe(12);
});

// ── THE CARRIER MATRIX (the one predicate every consumer derives from) ─────────────────────────────────

test("carrier CLASSES: party covers roster actors, npcs covers scene npcs, everyone covers both", () => {
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
  const bound = def({ key: "bound_will", label: "Bound Will", shape: "meter", write: "delta", subject: "actor", appliesTo: ["npc:demon"] });
  expect(carriesTracker(bound, carrier("demon", "npcs"))).toBe(true);
  // Same DISPLAY name, different ref key ⇒ not a carrier (the key is the identity).
  expect(carriesTracker(bound, { ...carrier("demon", "npcs"), actorKey: "npc:demon_2" })).toBe(false);
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
  expect(trackerGloss(meter, { value: 5, items: null, max: null })).toBe("Mana 5/10 (fuels spellcasting)");
  // No hint ⇒ no empty parens (the reading alone).
  expect(trackerGloss({ ...meter, hint: "" }, { value: 5, items: null, max: null })).toBe("Mana 5/10");
  // No ceiling ⇒ the bare reading.
  expect(trackerReading({ ...meter, max: null, hint: "" }, { value: 5, items: null, max: null })).toBe("Mana 5");
  // UNSET ⇒ null, never `Mana null` (an unset tracker carries no steering signal).
  expect(trackerGloss(meter, RPG_TRACKER_VALUE_EMPTY)).toBeNull();
  expect(trackerGloss(meter, undefined)).toBeNull();
});

test("the gloss reads text + list shapes in the same grammar", () => {
  const text = def({ key: "trust", label: "Trust", shape: "text", write: "set", subject: "actor", hint: "where they stand" });
  expect(trackerGloss(text, { value: "guarded", items: null, max: null })).toBe("Trust: guarded (where they stand)");
  const list = def({ key: "pack", label: "Pack", shape: "list", write: "set", subject: "actor" });
  expect(trackerGloss(list, { value: null, items: ["rope", "torch"], max: null })).toBe("Pack: rope, torch");
  // An EMPTY list is unset, not an empty line.
  expect(trackerGloss(list, { value: null, items: [], max: null })).toBeNull();
});

test("trackerNumber is the ONE narrowing of the stored union — a string meter never renders NaN", () => {
  // A hand edit or a model writing "5" must still drive a bar; anything genuinely non-numeric reads null
  // (the caller then omits the row rather than painting a NaN geometry).
  expect(trackerNumber({ value: 5, items: null, max: null })).toBe(5);
  expect(trackerNumber({ value: "5", items: null, max: null })).toBe(5);
  expect(trackerNumber({ value: "guarded", items: null, max: null })).toBeNull();
  expect(trackerNumber({ value: null, items: null, max: null })).toBeNull();
  expect(trackerNumber(undefined)).toBeNull();
});

// #1371 item 4 — the reading is WHOLLY-NUMERIC OR NOTHING. `parseInt` used to be lenient in the two
// directions that are wrong for a value the model authored and the delta applier then consumes.
test("a PARTIALLY-numeric string is a refusal, not a fabricated prefix reading", () => {
  // `"5garbage"` read as `5` before: indistinguishable from a meter genuinely set to 5.
  expect(trackerNumber({ value: "5garbage", items: null, max: null })).toBeNull();
  expect(trackerNumber({ value: "5 hp", items: null, max: null })).toBeNull();
  expect(trackerNumber({ value: "", items: null, max: null })).toBeNull();
  expect(trackerNumber({ value: "  ", items: null, max: null })).toBeNull();
  // `parseInt`'s hex arm is not part of this contract either.
  expect(trackerNumber({ value: "0x10", items: null, max: null })).toBeNull();
});

test("a FRACTIONAL string keeps its fraction — nothing downstream needs an integer", () => {
  // `"1.9"` truncated to `1` before, discarding what the model actually said.
  expect(trackerNumber({ value: "1.9", items: null, max: null })).toBe(1.9);
  expect(trackerNumber({ value: "-3", items: null, max: null })).toBe(-3);
  expect(trackerNumber({ value: "+7", items: null, max: null })).toBe(7);
  expect(trackerNumber({ value: " 12 ", items: null, max: null })).toBe(12);
});
