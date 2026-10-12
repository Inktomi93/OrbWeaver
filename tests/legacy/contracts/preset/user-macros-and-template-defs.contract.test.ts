// @orb/contracts/preset — user macro definitions, the template registry and the guided depth and marker defaults.

import type { TemplateDef } from "@orb/contracts/preset";
import {
  DEFAULT_FORMAT_STRINGS,
  DEFAULT_GUIDED_ACTIONS,
  DEFAULT_PROMPT_CONFIG,
  GUIDED_ACTION_KINDS,
  guidedActionConfigSchema,
  guidedActionsSchema,
  PRESET_FORMAT_SLOT_IDS,
  PROMPT_CONFIG_SCHEMA_VERSION,
  parsePromptConfig,
  TEMPLATE_CLUSTERS,
  TEMPLATE_DEFS,
  TEMPLATE_KINDS,
  userMacroSchema,
  userMacroValuesSchema,
} from "@orb/contracts/preset";
import { PRESET_PROSE_SLOT_IDS, PROSE_SLOTS } from "@orb/contracts/prose";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { byCodeUnit } from "./_support.ts";

// ── WAVE MU: user-macro definitions (strict-schema authoring pins) ─────────────────────────────────

test("userMacroSchema fills defaults for a bare {name, body} definition (strict-schema authoring law)", () => {
  const parsed = userMacroSchema.parse({ name: "greet", body: "Hi {{who}}" });
  expect(parsed).toEqual({ name: "greet", description: "", args: [], inputs: [], body: "Hi {{who}}", strict: false });
});

test("userMacroSchema rejects an unparseable macro name (the parser could never tokenize it)", () => {
  expect(userMacroSchema.safeParse({ name: "2bad", body: "x" }).success).toBe(false);
  expect(userMacroSchema.safeParse({ name: "has space", body: "x" }).success).toBe(false);
  expect(userMacroSchema.safeParse({ name: "ok-name_1", body: "x" }).success).toBe(true);
});

test("userMacroSchema rejects optional args that are NOT a contiguous suffix (the arity model's rule)", () => {
  const bad = userMacroSchema.safeParse({
    name: "m",
    body: "x",
    args: [
      { name: "a", type: "string", optional: true },
      { name: "b", type: "string", optional: false },
    ],
  });
  expect(bad.success).toBe(false);
  const ok = userMacroSchema.safeParse({
    name: "m",
    body: "x",
    args: [
      { name: "a", type: "string", optional: false },
      { name: "b", type: "string", optional: true },
    ],
  });
  expect(ok.success).toBe(true);
});

test("userMacroSchema fills every typed-input knob default (a def predating a knob self-heals)", () => {
  const parsed = userMacroSchema.parse({ name: "m", body: "{{x}}", inputs: [{ kind: "random-pick", name: "x" }] });
  expect(parsed.inputs[0]).toEqual({
    kind: "random-pick",
    name: "x",
    label: "",
    options: [],
    separator: ", ",
    onValue: "true",
    offValue: "",
    defaultValue: "",
  });
});

test("promptConfig.userMacros defaults to [] (a pre-MU blob parses — additive, no version bump)", () => {
  const parsed = parsePromptConfig({ schemaVersion: PROMPT_CONFIG_SCHEMA_VERSION, sections: [] });
  expect(parsed.userMacros).toEqual([]);
});

test("userMacroValuesSchema accepts the string | boolean | string[] value union (the #24 wire bag)", () => {
  const parsed = userMacroValuesSchema.parse({ m: { pov: "first", grim: true, themes: ["war", "loss"] } });
  expect(parsed).toEqual({ m: { pov: "first", grim: true, themes: ["war", "loss"] } });
  expect(userMacroValuesSchema.safeParse({ m: { bad: { nested: 1 } } }).success).toBe(false);
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// PRESET-1 — the template registry (§6.6 / G11), the G9/G10 additions, and the carrier-token write guard.
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test("TEMPLATE_DEFS covers every guided kind + every ACTION-shaped format string (wiFormat excluded by §6.6)", () => {
  const covered: string[] = TEMPLATE_DEFS.map((def) => def.id);
  // The module's tsc guard proves NOTHING IS MISSING; this proves nothing EXTRA and nothing DOUBLED — a
  // duplicate row would silently render two Actions rows for one slot.
  // Three arms since the 2026-08-07 ruling (the turn-wire FRAMINGS joined the tab): guided kinds · the
  // ACTION-shaped format strings · `PRESET_PROSE_SLOT_IDS`. The framings' own two-sided coverage lives in
  // `tests/legacy/contracts/prose` (it needs `home`, which is `#prose` data); what THIS row still owns is the
  // no-extra / no-duplicate half over the whole table.
  const expected = [...GUIDED_ACTION_KINDS, ...Object.keys(DEFAULT_FORMAT_STRINGS).filter((key) => key !== "wiFormat"), ...PRESET_PROSE_SLOT_IDS];
  expect(covered.toSorted(byCodeUnit)).toStrictEqual(expected.toSorted(byCodeUnit));
  expect(new Set(covered).size).toBe(covered.length);
  // `wiFormat` frames world-info ENTRIES and is edited in the WI marker's body — a row here would mint the
  // second home the §6.5 census exists to prevent.
  expect(covered).not.toContain("wiFormat");
});

test("every TemplateDef points at a REAL prose slot, and its kind is a declared TEMPLATE_KIND", () => {
  // A typo'd slot id would ghost nothing in that template's drill-in, silently. `defaultSlot` widened to the
  // whole `ProseSlotId` union with the framing rows, so the resolution target is the COMPOSED registry — a
  // guided row still points into `PRESET_PROSE_SLOTS`, a framing row into its own `chat.*` table row.
  const unresolvedSlots = TEMPLATE_DEFS.filter((def) => def.defaultSlot !== undefined && PROSE_SLOTS[def.defaultSlot] === undefined);
  expect(unresolvedSlots).toStrictEqual([]);
  // Every def ghosts real bytes: a slot-less def would be a default nobody can see.
  expect(TEMPLATE_DEFS.find((def) => def.id === "newChatMarker")?.defaultSlot).toBe("preset.format.newChatMarker");
  expect(TEMPLATE_DEFS.filter((def) => !TEMPLATE_KINDS.includes(def.kind))).toStrictEqual([]);
  expect(TEMPLATE_DEFS.filter((def) => def.label.length === 0 || def.fires.length === 0)).toStrictEqual([]);
});

test("clusters pair with the banded kind TWO-SIDEDLY: every extract row declares one, nothing else does", () => {
  // The Actions-tab IA: `extract` renders as
  // collapsed disclosure bands, so an extract row WITHOUT a cluster would render mis-filed above the bands —
  // and a clustered row of an un-banded kind would declare a band no renderer draws. The type system cannot
  // state the pairing (kind and cluster are independent fields), so this census is the enforcement.
  // Widened to the INTERFACE: the tuple's literal members omit the absent optional key entirely, so a
  // `.cluster` read on the raw union is a TS2339 rather than `undefined`.
  const defs: readonly TemplateDef[] = TEMPLATE_DEFS;
  expect(defs.filter((def) => def.kind === "extract" && def.cluster === undefined).map((def) => def.id)).toStrictEqual([]);
  expect(defs.filter((def) => def.kind !== "extract" && def.cluster !== undefined).map((def) => def.id)).toStrictEqual([]);
  // …and every declared cluster is DRAWN: no `TEMPLATE_CLUSTERS` member may be empty, or the tuple carries a
  // band label the list never renders (the vocabulary and the data drifting apart).
  for (const cluster of TEMPLATE_CLUSTERS) {
    expect(
      defs.some((def) => def.cluster === cluster),
      `cluster "${cluster}" has no rows`,
    ).toBe(true);
  }
});

test("a guided template declares role + depth; a nudge declares neither (text-only BY DERIVATION)", () => {
  const capsOf = (id: string): TemplateDef["caps"] | undefined => TEMPLATE_DEFS.find((def) => def.id === id)?.caps;
  expect(capsOf("response")?.map((cap) => cap.kind)).toStrictEqual(["role", "depth", "tokens"]);
  expect(capsOf("continueNudge")).toStrictEqual([]);
  expect(capsOf("newChatMarker")).toStrictEqual([]);
});

// ── G10: the guided-action `depth` is byte-compatible with every stored blob ───────────────────────
test("G10: an absent guided `depth` stays ABSENT after parse (today's fixed tail becomes the default)", () => {
  const parsed = guidedActionsSchema.parse(DEFAULT_GUIDED_ACTIONS);
  expect("depth" in parsed.response).toBe(false);
  // The whole DEFAULT config round-trips to the SAME bytes it had before the field existed.
  expect(JSON.stringify(parsePromptConfig(DEFAULT_PROMPT_CONFIG).guidedActions)).toBe(JSON.stringify(DEFAULT_GUIDED_ACTIONS));
});

test("G10: an explicit guided `depth` survives the parse and is bounded", () => {
  const parsed = guidedActionsSchema.parse({ ...DEFAULT_GUIDED_ACTIONS, response: { prompt: "x", role: "user", depth: 3 } });
  expect(parsed.response.depth).toBe(3);
  expect(guidedActionConfigSchema.safeParse({ prompt: "x", depth: -1 }).success).toBe(false);
});

// ── G9: newChatMarker ships ON as SillyTavern's `new_chat_prompt` text (owner ruling) ─────────────────────
test("G9: newChatMarker's shipped default is `[Start a new chat]`, read from its PROSE-1 slot", () => {
  expect(DEFAULT_FORMAT_STRINGS.newChatMarker).toBe("[Start a new chat]");
  expect(DEFAULT_PROMPT_CONFIG.formatStrings?.newChatMarker).toBe("[Start a new chat]");
  expect(PRESET_FORMAT_SLOT_IDS.newChatMarker).toBe("preset.format.newChatMarker");
});

test("G9: a stored blob predating the key parses, and the key stays absent (never invented on read)", () => {
  const parsed = parsePromptConfig({
    schemaVersion: PROMPT_CONFIG_SCHEMA_VERSION,
    sections: [],
    formatStrings: { wiFormat: "{{entry}}" },
  });
  expect(parsed.formatStrings?.newChatMarker).toBeUndefined();
});
