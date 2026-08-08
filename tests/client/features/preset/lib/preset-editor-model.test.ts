// Unit: the preset EDITOR's direct-bind model (features/preset/lib/preset-editor-model). No DOM — the node
// lane. Guards the W10 Panel-A merge-on-submit invariants that used to live in the DELETED contract mapper
// (preset-form-mapper-elimination.md): server-only fields the panel never edits survive; an all-default
// postProcess/reasoningParse/compaction block round-trips to UNSET; schemaVersion re-anchors to the server;
// and seedConfig fills the bind-friendly blocks so every nested path binds. The reasoningParse round-trip
// this replaces the deleted contract test for lands here.

import type { PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG, parsePromptConfig, THINK_PREFIX_DEFAULT, THINK_SUFFIX_DEFAULT } from "@orb/contracts/preset";
import type { ProseSlotId } from "@orb/contracts/prose";
import { PROSE_MAX_CHARS, PROSE_SLOTS } from "@orb/contracts/prose";
import { mergeOnSubmit, seedConfig, validatePresetProse } from "../../../../../packages/client/src/features/preset/lib/preset-editor-model.ts";
import { expect, test } from "../../../../support/fixtures.ts";

/** A parsed server config with server-only fields set (the fields the params panel never edits). */
function serverConfig(): PromptConfig {
  return parsePromptConfig({
    ...DEFAULT_PROMPT_CONFIG,
    params: { temperature: 0.7, advanced: { squashSystemMessages: true }, stop: ["END"] },
    customParameters: { provider: { order: ["x"] } },
    variables: [],
  });
}

// --- seedConfig fills the bind-friendly blocks --------------------------------

test("seedConfig fills postProcess + reasoningParse so every nested path binds", () => {
  const seeded = seedConfig(parsePromptConfig(DEFAULT_PROMPT_CONFIG));
  expect(seeded.postProcess).toBeDefined();
  expect(seeded.reasoningParse).toBeDefined();
  expect(seeded.reasoningParse?.prefix).toBe(THINK_PREFIX_DEFAULT);
});

test("seedConfig preserves an existing server postProcess block verbatim", () => {
  const server = parsePromptConfig({
    ...DEFAULT_PROMPT_CONFIG,
    postProcess: { collapseNewlines: true },
  });
  expect(seedConfig(server).postProcess?.collapseNewlines).toBe(true);
});

// --- the framing overrides normalize at SUBMIT, never at the keystroke --------
// The drill-in's textarea is CONTROLLED and its draft writes are verbatim (a trim in the keystroke handler
// fed the trimmed string back into the field and made the editor untypeable — no spaces, no newlines). So the
// trim + drop-the-blank live HERE, and these pin that they still happen.

test("submit TRIMS a framing override's text — the draft's verbatim edges do not persist", () => {
  const server = serverConfig();
  const edited: PromptConfig = { ...seedConfig(server), prose: { "chat.injection.userNote": { text: "  ((the table says: {{note}}))\n ", baseVersion: 1 } } };
  expect(mergeOnSubmit(edited, server).prose).toEqual({ "chat.injection.userNote": { text: "((the table says: {{note}}))", baseVersion: 1 } });
});

test("submit KEEPS interior whitespace and newlines — only the edges are trimmed", () => {
  // The typed-text half of the same rule: a framing is prose, and a multi-line one is legitimate.
  const server = serverConfig();
  const authored = "((the table says:\n\n{{note}}\n— the table))";
  const edited: PromptConfig = { ...seedConfig(server), prose: { "chat.injection.userNote": { text: authored, baseVersion: 1 } } };
  expect(mergeOnSubmit(edited, server).prose["chat.injection.userNote"]?.text).toBe(authored);
});

test("submit DROPS a blank framing override — clearing the field is a real reset, not empty bytes", () => {
  const server = serverConfig();
  const edited: PromptConfig = {
    ...seedConfig(server),
    prose: { "chat.injection.userNote": { text: "   ", baseVersion: 1 }, "chat.assembly.continuationNudge": { text: "[Your move.]", baseVersion: 1 } },
  };
  // The blank key is gone entirely (a stored `{text:""}` resolves to empty bytes); its sibling survives.
  expect(mergeOnSubmit(edited, server).prose).toEqual({ "chat.assembly.continuationNudge": { text: "[Your move.]", baseVersion: 1 } });
});

// --- mergeOnSubmit preserves server-only fields -------------------------------

test("merge preserves server-only fields the params panel never edits", () => {
  const server = serverConfig();
  const edited = seedConfig(server); // no edits — the whole config was bound
  const merged = mergeOnSubmit(edited, server);
  expect(merged.customParameters).toEqual({ provider: { order: ["x"] } });
  expect(merged.params.advanced).toEqual({ squashSystemMessages: true });
  expect(merged.params.stop).toEqual(["END"]);
  expect(merged.variables).toEqual(server.variables);
});

// D121-E narrowed this pin: `regexScripts` LEFT `PromptConfig` (a preset's scripts are junction rows now),
// so the BUILD-SPEC §8 flip it guards is about the remaining editable array — `variables`.
test("merge carries EDITED variables (BUILD-SPEC §8 flip — else edits are discarded)", () => {
  const server = serverConfig(); // the array is empty on the server
  const edited: PromptConfig = {
    ...seedConfig(server),
    variables: [
      {
        name: "mood",
        question: "How is the scene?",
        options: [{ label: "Tense", value: "tense" }],
        multiSelect: false,
        separator: ", ",
        randomPick: false,
      },
    ],
  };
  const merged = mergeOnSubmit(edited, server);
  expect(merged.variables).toHaveLength(1);
  expect(merged.variables[0]?.name).toBe("mood");
});

test("merge re-anchors schemaVersion to the server (a version bump is not a form edit)", () => {
  const server = { ...serverConfig(), schemaVersion: 3 };
  const edited = { ...seedConfig(server), schemaVersion: 999 };
  expect(mergeOnSubmit(edited, server).schemaVersion).toBe(3);
});

// --- absent-field-round-trips-to-unset ---------------------------------------

test("an all-default postProcess block round-trips to UNSET", () => {
  const server = parsePromptConfig(DEFAULT_PROMPT_CONFIG);
  const edited = seedConfig(server); // seedConfig fills postProcess with all-false
  expect(mergeOnSubmit(edited, server).postProcess).toBeUndefined();
});

test("an engaged postProcess block is PERSISTED", () => {
  const server = parsePromptConfig(DEFAULT_PROMPT_CONFIG);
  const edited: PromptConfig = {
    ...seedConfig(server),
    postProcess: {
      collapseNewlines: true,
      trimTrailingWhitespace: false,
      dropIncompleteSentence: false,
      singleLine: false,
    },
  };
  expect(mergeOnSubmit(edited, server).postProcess?.collapseNewlines).toBe(true);
});

test("an all-default reasoningParse block round-trips to UNSET; an engaged one persists", () => {
  const server = parsePromptConfig(DEFAULT_PROMPT_CONFIG);
  const seeded = seedConfig(server);
  // all-default (the seed) → unset
  expect(mergeOnSubmit(seeded, server).reasoningParse).toBeUndefined();
  // autoParse on → persisted
  const engaged: PromptConfig = {
    ...seeded,
    reasoningParse: { autoParse: true, prefix: THINK_PREFIX_DEFAULT, suffix: THINK_SUFFIX_DEFAULT },
  };
  expect(mergeOnSubmit(engaged, server).reasoningParse?.autoParse).toBe(true);
  // a custom tag (non-default) → persisted even with autoParse off
  const customTag: PromptConfig = {
    ...seeded,
    reasoningParse: { autoParse: false, prefix: "<reason>", suffix: "</reason>" },
  };
  expect(mergeOnSubmit(customTag, server).reasoningParse?.prefix).toBe("<reason>");
});

test("an empty compaction block round-trips to unset", () => {
  const server = parsePromptConfig(DEFAULT_PROMPT_CONFIG);
  const edited: PromptConfig = {
    ...seedConfig(server),
    params: { compaction: {} },
  };
  expect(mergeOnSubmit(edited, server).params.compaction).toBeUndefined();
});

// ── The over-cap SAVE REFUSAL (verifier finding on the EXTRACTION merge) ──────────────────────────────
// `proseOverridesSchema` heals an over-cap override to ABSENT, so persisting one is not an error the author
// can see — it is their wording deleted with the shipped default riding in its place. `validatePresetProse`
// is what makes the form invalid, and `isValid` is what the autosave factory's save driver AND its teardown
// flush both gate on. The rendered half is pinned in the preset-editor-surface CT.
const FRAMING: ProseSlotId = "chat.assembly.continuationNudge";

/** A seeded config carrying one framing override of `length` characters. */
function withProse(length: number): PromptConfig {
  const server = parsePromptConfig(DEFAULT_PROMPT_CONFIG);
  return { ...seedConfig(server), prose: { [FRAMING]: { text: "y".repeat(length), baseVersion: 1 } } };
}

test("validatePresetProse passes anything the schema will actually keep, and refuses what it would heal away", () => {
  expect(validatePresetProse(parsePromptConfig(DEFAULT_PROMPT_CONFIG))).toBeUndefined();
  expect(validatePresetProse(withProse(PROSE_MAX_CHARS))).toBeUndefined();
  // The boundary is the schema's, exactly: one character past `.max(PROSE_MAX_CHARS)` is the first value
  // that vanishes on the way in, and the first the editor must hold back.
  expect(validatePresetProse(withProse(PROSE_MAX_CHARS + 1))).toBeDefined();
  // The error NAMES the template rather than the slot id — nothing renders this string today (the drill-in's
  // own badge is the author-facing statement), but a future surface inherits a sentence a person can act on.
  expect(validatePresetProse(withProse(PROSE_MAX_CHARS + 1))?.fields["prose"]).toContain(PROSE_SLOTS[FRAMING].title);
});

test("validatePresetProse is blind to a RETIRED slot id left in a stored blob — it never indexes the registry with one", () => {
  // The same key class `proseOverridesSchema`'s preprocess strips (§4.4 rung 5). Indexing `PROSE_SLOTS` with
  // it would throw inside a form validator, i.e. brick the editor on a blob it was supposed to tolerate.
  const server = parsePromptConfig(DEFAULT_PROMPT_CONFIG);
  // FABRICATION-OK: a RETIRED slot id is by construction absent from `ProseSlotId`, so the input this guards against is unspellable in the type — the cast IS the probe, and no typed factory can produce it.
  const stale = { ...seedConfig(server), prose: { "retired.slot.id": { text: "y".repeat(PROSE_MAX_CHARS + 1), baseVersion: 1 } } } as PromptConfig;
  expect(validatePresetProse(stale)).toBeUndefined();
});
