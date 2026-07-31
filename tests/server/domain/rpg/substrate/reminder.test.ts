// tests/server/domain/rpg/substrate/reminder — the lite steering-injection assembler (rpg-design/05 §4.7).
// Pure string-building, so a unit test over hand-built tracker views: the state block per entity, the versioned
// license, and `steeringNote` LAST. The char turn is tool-less (owner ruling 2026-07-27) — the reminder carries
// NO tool-update guidance (that checklist lives in the tool round's prompt, entry/compose/rpg.ts).

import type { RpgGameFeatures, RpgSnapshotState, RpgTrackerView } from "@orb/contracts/rpg";
import { tokenizeContent } from "@orb/kit/content";
import type { LiteReminderInput } from "../../../../../packages/server/src/domain/rpg/contract/params";
import {
  buildLiteReminder,
  RPG_CARD_TEACH,
  RPG_CARD_TEACH_STATIC,
  RPG_CYOA_TEACH,
  RPG_DECEPTION_TEACH,
  RPG_OFILTER_TEACH,
  RPG_STEERING_LICENSE,
} from "../../../../../packages/server/src/domain/rpg/substrate/reminder";
import { expect, test } from "../../../../support/fixtures";

/** The feature-knob slice, defaulted ALL-TEACH-OFF so the pre-feature byte-exact assertions stay stable; the
 *  teach-composition tests below flip the relevant knobs explicitly. */
function features(over: Partial<RpgGameFeatures> = {}): RpgGameFeatures {
  return {
    castFields: [],
    relationshipHints: {},
    deception: false,
    omniscience: false,
    hiddenContentReveal: true,
    recentBeatsKeepLast: 8,
    pinnedOrbs: [],
    immersiveHtml: false,
    immersiveHtmlInteractive: true,
    cardKeepLastX: 0,
    cyoa: false,
    cyoaChoiceBehavior: "compose",
    plotProgression: true,
    ...over,
  };
}

/** A minimal empty tracker view (a fresh game — no state to report). */
function emptyView(over: Partial<RpgTrackerView> = {}): RpgTrackerView {
  return {
    ambient: null,
    lockedPaths: [],
    actors: [],
    cast: [],
    castFields: [],
    widgets: [],
    quests: [],
    plot: null,
    recentBeats: [],
    trackersReadOnly: false,
    poolOrbs: [],
    ...over,
  };
}

/** An empty snapshot state (the delta block's inputs — the reminder tests default to a no-change pair so the
 *  delta block OMITS, keeping the pre-delta assertions byte-stable; the delta placement is its own test). */
function emptyState(): RpgSnapshotState {
  return {
    clock: null,
    calendarDate: null,
    location: "",
    weather: null,
    presentCharacters: [],
    recentEvents: [],
    actorState: [],
    widgetValues: {},
    quests: [],
    plot: null,
    fieldLocks: null,
  };
}

/** A reminder input with the delta pair defaulted to a no-change (omitted-block) pair. */
function input(over: Partial<LiteReminderInput> = {}): LiteReminderInput {
  return {
    view: emptyView(),
    steeringNote: "",
    curSnapshot: emptyState(),
    prevSnapshot: emptyState(),
    features: features(),
    rosterNames: {},
    deception: false,
    omniscience: false,
    dateMode: "narrated",
    ...over,
  };
}

test("#9 dateMode: narrated DROPS the day counter (freeform date + time-of-day only); structured keeps it", () => {
  const view = emptyView({
    ambient: { location: "The Bone Road", calendarDate: "3rd of Frostmoon", clock: { day: 7, hour: 21, minute: 0 }, weather: { type: "rain", label: "" } },
  });
  const narrated = buildLiteReminder(input({ view }));
  expect(narrated).toContain("3rd of Frostmoon"); // the freeform date string IS the date datum
  expect(narrated).toContain("night"); // time-of-day stays STRUCTURED in both modes (the Waystone arm)
  expect(narrated).not.toContain("day 7"); // no forced sequential day counter
  const structured = buildLiteReminder(input({ view, dateMode: "structured" }));
  expect(structured).toContain("day 7 · night");
});

test("the ambient line shows the weather LABEL when the model wrote one, else the canonical type", () => {
  const labelled = emptyView({
    ambient: { location: "The Bone Road", calendarDate: null, clock: null, weather: { type: "snow", label: "torrential sleet" } },
  });
  const out = buildLiteReminder(input({ view: labelled }));
  expect(out).toContain("torrential sleet");
  expect(out).not.toContain("snow"); // the flavor REPLACES the bin name — never both
  const bare = emptyView({ ambient: { location: "The Bone Road", calendarDate: null, clock: null, weather: { type: "snow", label: "" } } });
  expect(buildLiteReminder(input({ view: bare }))).toContain("snow");
});

test("a fresh game reminder is just the license (no phantom empty headers; no-change delta omitted)", () => {
  const out = buildLiteReminder(input());
  expect(out).toBe(RPG_STEERING_LICENSE);
});

test("the reminder NEVER carries tool-update guidance (the char turn is tool-less; F7)", () => {
  // The dead UPDATE_GUIDANCE block was removed — the reminder is state flavor + license + note only. A
  // tool name appearing here would mean the dead block came back (the maintenance-trap the stickler flagged).
  const view = emptyView({
    actors: [
      {
        actorRef: { kind: "cast", castKey: "k" },
        name: "K",
        sheet: { className: "", attributes: {}, poolDefs: [], maxHp: null, level: null },
        volatile: null,
      },
    ],
  });
  const out = buildLiteReminder(input({ view }));
  expect(out).not.toContain("update_party");
  expect(out).not.toContain("MUST record");
});

test("the state block reports each plane, label-as-mini-prompt", () => {
  const view = emptyView({
    ambient: { location: "The Rusty Anchor", calendarDate: null, clock: { day: 2, hour: 21, minute: 0 }, weather: { type: "rain", label: "" } },
    actors: [
      {
        actorRef: { kind: "cast", castKey: "kael" },
        name: "Kael",
        sheet: {
          className: "Rogue",
          attributes: { dex: 16 },
          poolDefs: [{ name: "focus", max: 5, color: null, hint: "spent to steady the hand" }],
          maxHp: null,
          level: 3,
        },
        volatile: {
          actorRef: { kind: "cast", castKey: "kael" },
          hp: { value: 8, max: 12 },
          pools: [{ name: "focus", value: 3, max: 5 }],
          conditions: [{ name: "poisoned", stat: null, modifier: 0, turnsLeft: null }],
          inventory: [{ id: "i1", name: "dagger", description: "", quantity: 2, location: "", type: "" }],
          wallet: [{ name: "gold", amount: 40 }],
          status: "on edge",
        },
      },
    ],
    quests: [{ id: "q1", name: "Find the ledger", status: "active", description: "", objectives: [{ id: "o1", text: "search the office", completed: false }] }],
    recentBeats: ["The door slammed shut."],
  });
  const out = buildLiteReminder(input({ view }));
  // Ambient (time-of-day derived from hour 21 → "night"), the actor line, quest + open objective, beat.
  expect(out).toContain("The Rusty Anchor");
  expect(out).toContain("night");
  expect(out).toContain("Kael");
  expect(out).toContain("HP 8/12");
  expect(out).toContain("focus 3/5 (spent to steady the hand)"); // #36 — the host pool hint glosses the meaning
  expect(out).toContain("40 gold");
  expect(out).toContain("dagger ×2");
  expect(out).toContain("poisoned");
  expect(out).toContain("Find the ledger");
  expect(out).toContain("search the office");
  expect(out).toContain("The door slammed shut.");
  expect(out).toContain("Lv 3"); // §2.6 — the actor's hand-only level rides the party line
});

test("the cast line renders relationship + cast-fields kind-aware (features 1 + C)", () => {
  const view = emptyView({
    cast: [
      {
        key: "Mari",
        name: "Mari",
        emoji: "",
        mood: "wary",
        customFields: { suspicion: "7", trust: "guarded" },
        relationship: { kind: "custom", label: "vassal" },
      },
    ],
    castFields: [
      { key: "suspicion", label: "suspicion", kind: "meter", max: 10 },
      { key: "trust", label: "trust", kind: "text" },
    ],
  });
  const out = buildLiteReminder(input({ view, features: features({ relationshipHints: { vassal: "sworn to serve but resentful" } }) }));
  expect(out).toContain("Mari");
  expect(out).toContain("wary");
  expect(out).toContain("vassal (sworn to serve but resentful)"); // M1 hint gloss
  expect(out).toContain("suspicion 7/10"); // meter kind-aware
  expect(out).toContain("trust: guarded"); // text kind
});

// R4b (§4d-bis) — the host-authored cast-field `hint` must reach the MODEL, not just the panel tooltip. A bare
// tracked number moves narration by −0.12 (noise); the same number glossed moves it by −1.00. The gloss rides
// BOTH kinds, mirroring the pool (`focus 3/5 (…)`) and relationship (`vassal (…)`) grammar.
test("a hinted cast field glosses inline for BOTH kinds (meter + text); an unhinted one is unchanged", () => {
  const view = emptyView({
    cast: [
      {
        key: "Wren",
        name: "Wren",
        emoji: "",
        mood: "",
        customFields: { wits: "10", capped: "4", bond: "frayed", plain: "3" },
        relationship: { kind: "neutral", label: "" },
      },
    ],
    castFields: [
      { key: "wits", label: "Wits", kind: "meter", hint: "how sharp and quick-thinking she is right now" },
      { key: "capped", label: "Nerve", kind: "meter", max: 10, hint: "what she has left to spend on bravery" },
      { key: "bond", label: "Bond", kind: "text", hint: "where the two of them stand" },
      { key: "plain", label: "Debts", kind: "meter", max: 5 },
    ],
  });
  const out = buildLiteReminder(input({ view }));
  expect(out).toContain("Wits 10 (how sharp and quick-thinking she is right now)"); // meter, no max
  expect(out).toContain("Nerve 4/10 (what she has left to spend on bravery)"); // meter with max
  expect(out).toContain("Bond: frayed (where the two of them stand)"); // text kind
  expect(out).toContain("Debts 3/5"); // hint absent ⇒ today's exact format, no empty parens
  expect(out).not.toContain("Debts 3/5 (");
});

test("an EMPTY cast-field hint glosses nothing (no empty parens — the pool-hint idiom)", () => {
  const view = emptyView({
    cast: [{ key: "Wren", name: "Wren", emoji: "", mood: "", customFields: { wits: "7" }, relationship: { kind: "neutral", label: "" } }],
    castFields: [{ key: "wits", label: "Wits", kind: "meter", max: 10, hint: "" }],
  });
  const out = buildLiteReminder(input({ view }));
  expect(out).toContain("- Wren — Wits 7/10");
  expect(out).not.toContain("()");
});

test("a neutral relationship is silent in the cast line (no steering signal)", () => {
  const view = emptyView({
    cast: [{ key: "Bob", name: "Bob", emoji: "", mood: "", customFields: {}, relationship: { kind: "neutral", label: "" } }],
  });
  const out = buildLiteReminder(input({ view }));
  expect(out).toContain("Bob");
  expect(out).not.toContain("neutral");
});

test("the steering note is the always-wins tail (LAST)", () => {
  const out = buildLiteReminder(input({ steeringNote: "Keep it grim." }));
  expect(out.endsWith("Keep it grim.")).toBe(true);
  // It sits after the license.
  expect(out.indexOf("Keep it grim.")).toBeGreaterThan(out.indexOf(RPG_STEERING_LICENSE));
});

// The substitution fix (same class as the impersonate nudge): a host-authored steeringNote embedding
// {{user}}/{{char}} must render to the ACTIVE persona name / character name — NEVER literal braces (the gap
// that shipped `{{user}} keeps running into {{char}}` raw to the model every game turn).
test("the steering note SUBSTITUTES {{user}}/{{char}} when a steerMacros binding is supplied (never literal)", () => {
  const out = buildLiteReminder(
    input({
      steeringNote: "{{user}} keeps running into {{char}} at the konbini.",
      steerMacros: { user: "Nate", char: "Niko" },
    }),
  );
  expect(out).toContain("Nate keeps running into Niko at the konbini.");
  expect(out).not.toContain("{{user}}");
  expect(out).not.toContain("{{char}}");
});

// GUIDED-SAFE (the steer-neutralization ruling): a host steer gets IDENTITY substitution only — NOT full
// macro/variable/injection power. Non-identity macros ({{random}}/{{setvar}}/{{expr}}) re-emit VERBATIM.
test("the steering note does NOT resolve non-identity macros — {{random}}/{{setvar}} stay literal", () => {
  const out = buildLiteReminder(
    input({
      steeringNote: "As {{user}}: {{random::a::b}} then {{setvar::x::1}}.",
      steerMacros: { user: "Nate", char: "Niko" },
    }),
  );
  expect(out).toContain("As Nate:"); // {{user}} resolved
  expect(out).toContain("{{random::a::b}}"); // NOT rolled — no volatile power
  expect(out).toContain("{{setvar::x::1}}"); // NOT executed — no variable power
});

// Absent binding (a caller that supplies no steerMacros — e.g. a legacy path) ⇒ the note ships VERBATIM
// (the byte-identical pre-fix behavior; every existing reminder test relies on this default).
test("an ABSENT steerMacros binding ships the steering note verbatim (byte-identical pre-fix path)", () => {
  const out = buildLiteReminder(input({ steeringNote: "Stay in {{char}}'s voice." }));
  expect(out).toContain("Stay in {{char}}'s voice."); // literal — no binding, no substitution
});

test("an active-only quest filter (completed quests never clutter the reminder)", () => {
  const view = emptyView({
    quests: [
      { id: "q1", name: "Open quest", status: "active", description: "", objectives: [] },
      { id: "q2", name: "Done quest", status: "completed", description: "", objectives: [] },
    ],
  });
  const out = buildLiteReminder(input({ view }));
  expect(out).toContain("Open quest");
  expect(out).not.toContain("Done quest");
});

test("the DELTA block renders BETWEEN the state block and the license (§2.7 placement, always-on)", () => {
  // A prev→cur pair with a real change: the delta must appear AFTER the game-state absolutes and BEFORE the
  // license (the license's "let the change land" gets its referent).
  const actor = (hp: number): RpgSnapshotState => ({
    ...emptyState(),
    location: "The Docks",
    actorState: [{ actorRef: { kind: "cast", castKey: "kael" }, hp: { value: hp, max: 20 }, pools: [], conditions: [], inventory: [], wallet: [], status: "" }],
  });
  const view = emptyView({ ambient: { location: "The Docks", calendarDate: null, clock: null, weather: null } });
  const out = buildLiteReminder(input({ view, curSnapshot: actor(16), prevSnapshot: actor(12) }));
  expect(out).toContain("CHANGES SINCE LAST BEAT");
  expect(out).toContain("kael HP 12→16 (+4)");
  // Placement: after the game-state header, before the license.
  expect(out.indexOf("# Game state")).toBeLessThan(out.indexOf("CHANGES SINCE LAST BEAT"));
  expect(out.indexOf("CHANGES SINCE LAST BEAT")).toBeLessThan(out.indexOf(RPG_STEERING_LICENSE));
});

test("no-change delta is OMITTED — the reminder is byte-stable on a quiet turn", () => {
  const s = { ...emptyState(), location: "The Docks" };
  const out = buildLiteReminder(input({ curSnapshot: s, prevSnapshot: { ...s } }));
  expect(out).not.toContain("CHANGES SINCE LAST BEAT");
});

test("the first-snapshot delta labels the born state as SCENE OPENS (not everything-changed)", () => {
  const born: RpgSnapshotState = { ...emptyState(), location: "The Rusty Anchor" };
  const out = buildLiteReminder(input({ curSnapshot: born, prevSnapshot: null }));
  expect(out).toContain("SCENE OPENS");
  expect(out).toContain("The Rusty Anchor");
  expect(out).not.toContain("CHANGES SINCE LAST BEAT");
});

// ── P3 §3.3: the hidden-channel teaching blocks compose config-gated, before the license ──

test("both hidden channels OFF ⇒ no teaching block (byte-identical to a pre-P3 reminder)", () => {
  const out = buildLiteReminder(input({ deception: false, omniscience: false }));
  expect(out).toBe(RPG_STEERING_LICENSE);
  expect(out).not.toContain("<lie");
  expect(out).not.toContain("<ofilter");
});

test("deception ON composes RPG_DECEPTION_TEACH before the license; omniscience OFF ⇒ no ofilter teach", () => {
  const out = buildLiteReminder(input({ deception: true, omniscience: false }));
  expect(out).toContain(RPG_DECEPTION_TEACH);
  expect(out.indexOf(RPG_DECEPTION_TEACH)).toBeLessThan(out.indexOf(RPG_STEERING_LICENSE));
  expect(out).not.toContain(RPG_OFILTER_TEACH);
  // The teach shows the self-closing tag grammar the tokenizer recognizes.
  expect(out).toContain("<lie ");
});

test("omniscience ON composes RPG_OFILTER_TEACH; both ON compose both, in order", () => {
  const ofilterOnly = buildLiteReminder(input({ deception: false, omniscience: true }));
  expect(ofilterOnly).toContain(RPG_OFILTER_TEACH);
  expect(ofilterOnly).not.toContain(RPG_DECEPTION_TEACH);

  const both = buildLiteReminder(input({ deception: true, omniscience: true }));
  expect(both.indexOf(RPG_DECEPTION_TEACH)).toBeLessThan(both.indexOf(RPG_OFILTER_TEACH));
  expect(both.indexOf(RPG_OFILTER_TEACH)).toBeLessThan(both.indexOf(RPG_STEERING_LICENSE));
});

test("the teaching tags are TOKENIZER-VALID self-closing spans the HIDDEN_TAGS registry recognizes", () => {
  // The teach strings SHOW the model the exact grammar; a malformed example would train malformed output. Prove
  // an emitted lie in that shape tokenizes to a hidden span (so the member-strip + reveal will catch it live).
  const emitted = '<lie character="Mari" type="motive" truth="she wants the gold" reason="greed" />';
  const spans = tokenizeContent(emitted);
  expect(spans.some((s) => s.kind === "hidden" && s.tag === "lie")).toBe(true);
});

// ── P4 — the card TEACHING block (parity-plus §3.3/§7.5 + M3) ────────────────────────────────────────────

test("immersiveHtml ON composes the card teach AFTER state, BEFORE the license (§3.3 order)", () => {
  const view = emptyView({ ambient: { location: "The Docks", calendarDate: null, clock: null, weather: null } });
  const out = buildLiteReminder(input({ view, features: features({ immersiveHtml: true }) }));
  expect(out).toContain(RPG_CARD_TEACH);
  expect(out.indexOf("# Game state")).toBeLessThan(out.indexOf(RPG_CARD_TEACH));
  expect(out.indexOf(RPG_CARD_TEACH)).toBeLessThan(out.indexOf(RPG_STEERING_LICENSE));
});

test("BOTH card teach variants forbid nesting a directive inside the card (the live nested-closer failure class)", () => {
  // The RV-2 root cause was a model that opened `:::card`, then opened `:::choices` INSIDE it and spent the
  // single `:::` on the inner fence — the card never closed and the whole message degraded to raw fence text.
  // The tokenizer's committed EOF-close catches it after the fact; this clause stops it being written.
  for (const teach of [RPG_CARD_TEACH, RPG_CARD_TEACH_STATIC]) {
    expect(teach).toContain("Close the card with its own `:::` line BEFORE you open any other directive");
    expect(teach).toContain(":::choices");
  }
});

test("immersiveHtml OFF emits NO card teach (applicability — absent, not a stub)", () => {
  const out = buildLiteReminder(input({ features: features({ immersiveHtml: false }) }));
  expect(out).not.toContain(":::card");
  expect(out).toBe(RPG_STEERING_LICENSE);
});

// ── P5 — the CYOA teach (§5.4) + the plot Story line ────────────────────────────────────────────────────

test("cyoa ON composes RPG_CYOA_TEACH before the license; OFF emits nothing (applicability)", () => {
  const on = buildLiteReminder(input({ features: features({ cyoa: true }) }));
  expect(on).toContain(RPG_CYOA_TEACH);
  expect(on.indexOf(RPG_CYOA_TEACH)).toBeLessThan(on.indexOf(RPG_STEERING_LICENSE));
  const off = buildLiteReminder(input());
  expect(off).not.toContain(":::choices");
  expect(off).toBe(RPG_STEERING_LICENSE);
});

test("the CYOA teach teaches the exact fence grammar the tokenizer recognizes (:::choices … :::)", () => {
  expect(RPG_CYOA_TEACH).toContain(":::choices");
  // The teach names numbered options — the CHOICE_LINE grammar (`N. text`) the fence body parses.
  expect(RPG_CYOA_TEACH).toContain("numbered");
});

test("a plot plane renders a Story line in the state block (act n/total + the act title)", () => {
  const view = emptyView({
    plot: {
      act: 2,
      title: "The Bone Key",
      acts: [
        { title: "Arrival", summary: "" },
        { title: "Descent", summary: "Down the stair." },
      ],
    },
  });
  const out = buildLiteReminder(input({ view }));
  expect(out).toContain("Story: The Bone Key — act 2/2: Descent — Down the stair.");
  // A plot-less game renders NO Story line (null plane, byte-identical pre-P5 reminder).
  expect(buildLiteReminder(input())).not.toContain("Story:");
});

test("M3 interactive OFF swaps the ASK to the static variant (the render is untouched by design)", () => {
  const out = buildLiteReminder(input({ features: features({ immersiveHtml: true, immersiveHtmlInteractive: false }) }));
  expect(out).toContain(RPG_CARD_TEACH_STATIC);
  expect(out).not.toContain(RPG_CARD_TEACH);
  // The static ask never invites scripts/interactivity.
  expect(RPG_CARD_TEACH_STATIC).not.toContain("interactive");
  expect(RPG_CARD_TEACH_STATIC).not.toContain("JS");
});
