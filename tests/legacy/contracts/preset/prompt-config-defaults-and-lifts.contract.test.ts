// @orb-waive-file no-test-fabrication({ compaction: { mode: string; thresholdPct: number } }): baselined when the gate widened to value casts; burn-down item 906.
// @orb/contracts/preset — the prompt config defaults and the CONFIG_LIFTS walk over stored blobs.

import {
  CONFIG_LIFTS,
  DEFAULT_MARKER_TEMPLATES,
  DEFAULT_PROMPT_CONFIG,
  NARRATOR_MAIN_PROMPT_TEMPLATE,
  PROMPT_CONFIG_SCHEMA_VERSION,
  parsePromptConfig,
  promptConfigSchema,
} from "@orb/contracts/preset";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import {
  SAMPLE_TEMPERATURE,
  SCHEMA_VERSION_V1,
  SCHEMA_VERSION_V2,
  SCHEMA_VERSION_V3,
  SCHEMA_VERSION_V4,
  SCHEMA_VERSION_V5,
  SCHEMA_VERSION_V6,
  SCHEMA_VERSION_V7,
  SCHEMA_VERSION_V8,
} from "./_support.ts";

test("promptConfigSchema accepts DEFAULT_PROMPT_CONFIG and parsePromptConfig round-trips it", () => {
  expect(promptConfigSchema.parse(DEFAULT_PROMPT_CONFIG)).toEqual(DEFAULT_PROMPT_CONFIG);
  expect(parsePromptConfig(DEFAULT_PROMPT_CONFIG)).toEqual(DEFAULT_PROMPT_CONFIG);
});

test("the starter arrangement stores NO section templates — the built-in opens fully ghosted (side-eye F-03)", () => {
  // The `custom` cue and the full-weight body derive from `template !== undefined`, so a starter that
  // MATERIALIZES a default as a stored value makes the untouched built-in — the first preset every user
  // meets — open looking edited. The starter framing lives in `DEFAULT_MARKER_TEMPLATES` instead, which is
  // where every other marker's default already lived.
  const stored = DEFAULT_PROMPT_CONFIG.sections.filter((section) => "template" in section && section.template !== undefined);
  expect(stored).toStrictEqual([]);

  // …and the WIRE is unchanged: the assembler resolves `section.template ?? DEFAULT_MARKER_TEMPLATES[marker]`,
  // so the same bytes still go out for the main prompt.
  expect(DEFAULT_MARKER_TEMPLATES.main_prompt).toContain("{{char}}");
  expect(DEFAULT_MARKER_TEMPLATES.main_prompt).toContain("{{user}}");
});

test("the two main_prompt defaults differ ONLY in the perspective framing — the address clause is verbatim in both", () => {
  // The narrator sibling is a second TEXT, never a second rule: the vocative defect the address clause fixes
  // (a default persona's name is a LABEL, so "Goodnight, You.") is a property of `{{user}}`, not of the
  // turn's mode, and the clause is owner-ruled (2026-08-02). WHICH text a turn gets is decided once, in
  // `assembly/assemble.ts` templateFor — nothing here re-derives it.
  const addressClause = "Address {{user}} in the second person; use their name only when it is one they have chosen for themselves.";
  expect(DEFAULT_MARKER_TEMPLATES.main_prompt).toContain(addressClause);
  expect(NARRATOR_MAIN_PROMPT_TEMPLATE).toContain(addressClause);
  // The narrator text carries the joined cast as its VOICES, never as one perspective to write.
  expect(NARRATOR_MAIN_PROMPT_TEMPLATE).toContain("{{char}}");
  expect(NARRATOR_MAIN_PROMPT_TEMPLATE).not.toContain("perspective only");
  // Owner ruling: the per-speaker text names no single perspective either — the round cue names the speaker.
  expect(DEFAULT_MARKER_TEMPLATES.main_prompt).not.toContain("perspective only");
});

test("parsePromptConfig degrades a non-object / malformed blob to DEFAULT_PROMPT_CONFIG (lenient)", () => {
  expect(parsePromptConfig(null)).toEqual(DEFAULT_PROMPT_CONFIG);
  expect(parsePromptConfig("not a config")).toEqual(DEFAULT_PROMPT_CONFIG);
});

// ── The CONFIG_LIFTS walk: the three v1→v2 transforms + the v2→v3 version stamp ─────────────────────

test("CONFIG_LIFTS v1→v2 applies all three transforms (main→marker, jailbreak fold, pivot insert)", () => {
  const liftV1 = CONFIG_LIFTS[SCHEMA_VERSION_V1];
  if (liftV1 === undefined) {
    throw new Error("CONFIG_LIFTS[1] is missing");
  }
  const lifted = liftV1({
    schemaVersion: SCHEMA_VERSION_V1,
    sections: [
      // (b) a literal "Main" → becomes a main_prompt marker carrying its content as the template.
      {
        type: "literal",
        id: "main",
        name: "Main",
        role: "system",
        content: "BE GOOD",
        enabled: true,
      },
      // standalone char_system → dropped entirely.
      { type: "marker", id: "cs", name: "Char system", marker: "char_system", enabled: true },
      // (a) jailbreak template content → folded into post_history's template; jailbreak removed.
      {
        type: "marker",
        id: "jb",
        name: "Jailbreak",
        marker: "jailbreak",
        template: "STAY ON TASK",
      },
      { type: "marker", id: "ph", name: "Post-history", marker: "post_history", enabled: true },
    ],
  });

  // @orb-waive no-test-fabrication(Record<string, unknown>[]): baselined when the gate widened to value casts; burn-down item 906.
  const sections = lifted["sections"] as Record<string, unknown>[];
  const markers = sections.map((s): unknown => s["marker"]);
  const mainSection = sections.find((s): boolean => s["marker"] === "main_prompt");
  const phSection = sections.find((s): boolean => s["marker"] === "post_history");

  // (b) the literal "main" is now a main_prompt marker with the literal's content as template.
  expect(mainSection?.["template"]).toBe("BE GOOD");
  // char_system + jailbreak are gone.
  expect(markers).not.toContain("char_system");
  expect(markers).not.toContain("jailbreak");
  // (a) the jailbreak content folded into post_history's template.
  expect(phSection?.["template"]).toBe("STAY ON TASK");
  // (c) a chat_history pivot was inserted (post_history existed, none was present).
  expect(markers).toContain("chat_history");
  expect(lifted["schemaVersion"]).toBe(SCHEMA_VERSION_V2);
});

test("CONFIG_LIFTS v1→v2 inserts NO pivot when there is no post_history (the post-history guard)", () => {
  const liftV1 = CONFIG_LIFTS[SCHEMA_VERSION_V1];
  if (liftV1 === undefined) {
    throw new Error("CONFIG_LIFTS[1] is missing");
  }
  const lifted = liftV1({
    schemaVersion: SCHEMA_VERSION_V1,
    sections: [{ type: "marker", id: "d", name: "Description", marker: "char_description", enabled: true }],
  });
  // @orb-waive no-test-fabrication(Record<string, unknown>[]): baselined when the gate widened to value casts; burn-down item 906.
  const sections = lifted["sections"] as Record<string, unknown>[];
  const markers = sections.map((s): unknown => s["marker"]);
  expect(markers).not.toContain("chat_history");
});

test("a full v1 blob parsed through parsePromptConfig is lifted to the current version", () => {
  const parsed = parsePromptConfig({
    schemaVersion: SCHEMA_VERSION_V1,
    sections: [
      { type: "literal", id: "main", name: "Main", role: "system", content: "X", enabled: true },
      { type: "marker", id: "ph", name: "Post-history", marker: "post_history", enabled: true },
    ],
  });
  expect(parsed.schemaVersion).toBe(PROMPT_CONFIG_SCHEMA_VERSION);
  const markers = parsed.sections.map((s): unknown => (s.type === "marker" ? s.marker : null));
  expect(markers).toContain("main_prompt");
  expect(markers).toContain("chat_history");
});

// v3→v4: `compaction.mode:"off"` is retired (owner ruling — compaction is a safety property). A stored "off"
// lifts to "managed" so an existing preset never validation-fails on the removed member.
test("CONFIG_LIFTS v3→v4 maps a stored compaction.mode:'off' to 'managed'", () => {
  const liftV3 = CONFIG_LIFTS[SCHEMA_VERSION_V3];
  if (liftV3 === undefined) {
    throw new Error("CONFIG_LIFTS[3] is missing");
  }
  const lifted = liftV3({ schemaVersion: SCHEMA_VERSION_V3, params: { compaction: { mode: "off", thresholdPct: 0.7 } } });
  expect(lifted["schemaVersion"]).toBe(SCHEMA_VERSION_V4);
  const params = lifted["params"] as { compaction: { mode: string; thresholdPct: number } };
  expect(params.compaction.mode).toBe("managed"); // "off" retired → managed
  expect(params.compaction.thresholdPct).toBe(0.7); // the rest is untouched
});

test("a stored preset with compaction.mode:'off' parses (lifted to managed) rather than rejecting", () => {
  const parsed = parsePromptConfig({
    ...DEFAULT_PROMPT_CONFIG,
    schemaVersion: SCHEMA_VERSION_V3,
    params: { ...DEFAULT_PROMPT_CONFIG.params, compaction: { mode: "off" } },
  });
  expect(parsed.schemaVersion).toBe(PROMPT_CONFIG_SCHEMA_VERSION);
  expect(parsed.params.compaction?.mode).toBe("managed");
});

// v4→v5 (redesign G8): the Default/Custom/SILENT tri-state is retired. Silent's stored form was
// `template: ""` ("render nothing"), which is the ENABLE mechanism wearing a second face — so an empty
// template lifts to `{ template: undefined, enabled: false }`. This is what makes "clear the field = the
// built-in default rides" true for EVERY section rather than only the ones nobody had silenced.
test("CONFIG_LIFTS v4→v5 turns a silenced (template:'') marker into a DISABLED one with no template", () => {
  const liftV4 = CONFIG_LIFTS[SCHEMA_VERSION_V4];
  if (liftV4 === undefined) {
    throw new Error("CONFIG_LIFTS[4] is missing");
  }
  const lifted = liftV4({
    schemaVersion: SCHEMA_VERSION_V4,
    sections: [
      { type: "marker", id: "silent", name: "Scenario", marker: "scenario", role: "system", enabled: true, template: "" },
      { type: "marker", id: "custom", name: "Main", marker: "main_prompt", role: "system", enabled: true, template: "keep me" },
      { type: "literal", id: "lit", name: "Note", role: "system", content: "", enabled: true },
    ],
  });
  expect(lifted["schemaVersion"]).toBe(SCHEMA_VERSION_V5);
  // @orb-waive no-test-fabrication(Record<string, unknown>[]): baselined when the gate widened to value casts; burn-down item 906.
  const sections = lifted["sections"] as Record<string, unknown>[];
  // The silenced marker: the template is GONE (not emptied) and the section is off.
  expect(sections[0]).not.toHaveProperty("template");
  expect(sections[0]?.["enabled"]).toBe(false);
  // A real custom template and a literal with empty CONTENT (a different field) are untouched.
  expect(sections[1]?.["template"]).toBe("keep me");
  expect(sections[1]?.["enabled"]).toBe(true);
  expect(sections[2]?.["enabled"]).toBe(true);
});

// v5→v6 (owner ruling 2026-08-02, resolving D6): `params.maxBudgetUsd` is DELETED — it had no editor on any
// surface, so nobody could set, read or clear it. The LIFT is the load-bearing half: `userIntentSchema` is
// `.strict()` and `promptConfigSchema` `.catch({})`s the whole params blob on failure, so a silent field
// removal would make ONE stored budget key wipe every other knob on that preset.
test("CONFIG_LIFTS v5→v6 strips the retired maxBudgetUsd knob and leaves every sibling knob intact", () => {
  const liftV5 = CONFIG_LIFTS[SCHEMA_VERSION_V5];
  if (liftV5 === undefined) {
    throw new Error("CONFIG_LIFTS[5] is missing");
  }
  const lifted = liftV5({
    schemaVersion: SCHEMA_VERSION_V5,
    params: { maxBudgetUsd: 5, temperature: SAMPLE_TEMPERATURE, quality: "deep" },
  });
  expect(lifted["schemaVersion"]).toBe(SCHEMA_VERSION_V6);
  expect(lifted["params"]).toEqual({ temperature: SAMPLE_TEMPERATURE, quality: "deep" });

  // A blob that never carried it passes through untouched (by reference — the shape every lift here uses).
  const params = { temperature: SAMPLE_TEMPERATURE };
  expect(liftV5({ schemaVersion: SCHEMA_VERSION_V5, params })["params"]).toBe(params);
});

test("a stored preset carrying maxBudgetUsd parses forward WITHOUT losing its other params (the .catch({}) trap)", () => {
  // Without the lift this whole blob's params degrade to `{}` — the strict schema rejects the unknown key
  // and the catch swallows the entire object. That is the regression this test exists to make loud.
  const parsed = parsePromptConfig({
    ...DEFAULT_PROMPT_CONFIG,
    schemaVersion: SCHEMA_VERSION_V5,
    params: { maxBudgetUsd: 12.5, temperature: SAMPLE_TEMPERATURE, quality: "deep" },
  });
  expect(parsed.schemaVersion).toBe(PROMPT_CONFIG_SCHEMA_VERSION);
  expect(parsed.params).toEqual({ temperature: SAMPLE_TEMPERATURE, quality: "deep" });
  expect("maxBudgetUsd" in parsed.params).toBe(false);
});

// v6→v7 (issue #80): the `databank` marker + its default section. STAMP-ONLY — the shipped arrangement
// gained a section, but a STORED one is an author's document and is never rewritten (the warning chip is
// what covers a preset that names no slot). The bump exists so the boot seeder reseeds the OWNERLESS rows.
test("CONFIG_LIFTS v6→v7 stamps the version and rewrites NOTHING of a user-owned config", () => {
  const liftV6 = CONFIG_LIFTS[SCHEMA_VERSION_V6];
  if (liftV6 === undefined) {
    throw new Error("CONFIG_LIFTS[6] is missing");
  }
  const stored = {
    schemaVersion: SCHEMA_VERSION_V6,
    // A hand-built arrangement that names no databank slot — exactly the config the chip warns about, and
    // exactly the config a lift must not "helpfully" repair.
    sections: [{ type: "marker", id: "main", name: "Mine", marker: "main_prompt", role: "system", enabled: true, template: "MY FRAMING" }],
    params: { temperature: SAMPLE_TEMPERATURE },
    variables: [{ name: "pov", question: "POV?", options: [{ label: "first", value: "first" }] }],
    prose: { "preset.guided.opening": { text: "mine", baseVersion: 1 } },
  };
  const before = JSON.stringify(stored);
  const lifted = liftV6(stored);

  expect(lifted["schemaVersion"]).toBe(SCHEMA_VERSION_V7);
  // Every other key is the SAME VALUE BY REFERENCE — nothing was rebuilt, reordered or defaulted.
  expect(lifted["sections"]).toBe(stored.sections);
  expect(lifted["params"]).toBe(stored.params);
  expect(lifted["variables"]).toBe(stored.variables);
  expect(lifted["prose"]).toBe(stored.prose);
  // …and the lift did not mutate the input blob it was handed.
  expect(JSON.stringify(stored)).toBe(before);
});

test("a v6 user preset parses forward slotless — the databank section is NOT injected into stored configs", () => {
  const parsed = parsePromptConfig({
    schemaVersion: SCHEMA_VERSION_V6,
    sections: [{ type: "marker", id: "main", name: "Mine", marker: "main_prompt", role: "system", enabled: true, template: "MY FRAMING" }],
    params: { temperature: SAMPLE_TEMPERATURE },
    prose: {},
  });
  expect(parsed.schemaVersion).toBe(PROMPT_CONFIG_SCHEMA_VERSION);
  expect(parsed.sections.map((section) => section.id)).toEqual(["main"]);
});

// The other half of the bump: the SHIPPED arrangement must actually carry the slot, or issue #80 is only
// half-fixed — the gather retrieves and the prompt still never names the value.
test("the built-in default arrangement places the databank slot immediately after memory", () => {
  const ids = DEFAULT_PROMPT_CONFIG.sections.map((section) => section.id);
  expect(ids).toContain("databank");
  expect(ids.indexOf("databank")).toBe(ids.indexOf("memory") + 1);
  const databank = DEFAULT_PROMPT_CONFIG.sections.find((section) => section.id === "databank");
  expect(databank).toMatchObject({ type: "marker", marker: "databank", enabled: true });
  // The section ships UNSET, so the framing is the marker default (the F-03 rule) — and that default is
  // where the ST `file_template_db` wrapper prose lives, never in databank's value.
  expect(databank).not.toHaveProperty("template");
  expect(DEFAULT_MARKER_TEMPLATES.databank).toContain("{{databank}}");
  expect(DEFAULT_MARKER_TEMPLATES.databank).toContain("Related information:");
});

// D251: a per-turn section above Chat History rewrites the system prompt every turn and costs the history its
// cache, so the shipped arrangement lists all three below the pivot. The delivered shape is pinned through the
// real walk and SHAPE in `tests/legacy/server/domain/chat/assembly/shape-system-row-placement.test.ts`.
test("the built-in default arrangement lists memory, databank and the guided instruction below Chat History", () => {
  const ids = DEFAULT_PROMPT_CONFIG.sections.map((section) => section.id);
  const pivot = ids.indexOf("chat-history");
  expect(pivot).toBeGreaterThanOrEqual(0);
  const perTurn = ["memory", "databank", "guided-instruction"].map((id) => ids.indexOf(id));
  expect(perTurn.every((at) => at > pivot)).toBe(true);
});

test("CONFIG_LIFTS v7→v8 stamps the version and rewrites NOTHING of a user-owned config", () => {
  const liftV7 = CONFIG_LIFTS[SCHEMA_VERSION_V7];
  if (liftV7 === undefined) {
    throw new Error("CONFIG_LIFTS[7] is missing");
  }
  // An author's arrangement with memory ABOVE the pivot — exactly the order the lift must not "repair".
  const stored = {
    schemaVersion: SCHEMA_VERSION_V7,
    sections: [
      { type: "marker", id: "memory", name: "Mine", marker: "memory", role: "system", enabled: true },
      { type: "marker", id: "chat-history", name: "History", marker: "chat_history", role: "system", enabled: true },
    ],
    params: { temperature: SAMPLE_TEMPERATURE },
    prose: {},
  };
  const before = JSON.stringify(stored);
  const lifted = liftV7(stored);

  expect(lifted["schemaVersion"]).toBe(SCHEMA_VERSION_V8);
  expect(lifted["sections"]).toBe(stored.sections);
  expect(lifted["params"]).toBe(stored.params);
  expect(lifted["prose"]).toBe(stored.prose);
  expect(JSON.stringify(stored)).toBe(before);
});

test("a stored preset carrying a silenced marker parses forward to a disabled, default-templated one", () => {
  const parsed = parsePromptConfig({
    ...DEFAULT_PROMPT_CONFIG,
    schemaVersion: SCHEMA_VERSION_V4,
    sections: [{ type: "marker", id: "silent", name: "Scenario", marker: "scenario", role: "system", enabled: true, template: "" }],
  });
  expect(parsed.schemaVersion).toBe(PROMPT_CONFIG_SCHEMA_VERSION);
  const section = parsed.sections[0];
  // The key is GONE, not emptied — which is what makes "omit ⇒ the built-in default" the only reading.
  expect(section === undefined ? true : "template" in section).toBe(false);
  expect(section?.enabled).toBe(false);
});
