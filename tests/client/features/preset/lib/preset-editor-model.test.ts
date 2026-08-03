// Unit: the preset EDITOR's direct-bind model (features/preset/lib/preset-editor-model). No DOM — the node
// lane. Guards the W10 Panel-A merge-on-submit invariants that used to live in the DELETED contract mapper
// (preset-form-mapper-elimination.md): server-only fields the panel never edits survive; an all-default
// postProcess/reasoningParse/compaction block round-trips to UNSET; schemaVersion re-anchors to the server;
// and seedConfig fills the bind-friendly blocks so every nested path binds. The reasoningParse round-trip
// this replaces the deleted contract test for lands here.

import type { PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG, parsePromptConfig, THINK_PREFIX_DEFAULT, THINK_SUFFIX_DEFAULT } from "@orb/contracts/preset";
import { mergeOnSubmit, seedConfig } from "../../../../../packages/client/src/features/preset/lib/preset-editor-model.ts";
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
